import hashlib

import pytest

from hermes_cli.local_llm import catalog, downloads, paths
from hermes_cli.local_llm.errors import (
    DownloadBusyError,
    InsufficientDiskError,
    LocalLLMError,
)

PAYLOAD = b"fake gguf bytes" * 100


def make_spec(sha=None, size=None):
    return catalog.LocalModelSpec(
        id="test-model",
        label="Test",
        url="https://example.invalid/test.gguf",
        sha256=sha or hashlib.sha256(PAYLOAD).hexdigest(),
        size_bytes=size if size is not None else len(PAYLOAD),
        min_ram_gb=8,
        description="test",
    )


def chunked_fetcher(payload):
    def fetch(url):
        for i in range(0, len(payload), 64):
            yield payload[i : i + 64]

    return fetch


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    # binary already "installed" so model tests skip the binary phase
    binary = tmp_path / "local-llm" / "bin" / "llama-server"
    binary.parent.mkdir(parents=True)
    binary.write_bytes(b"bin")
    monkeypatch.setattr(downloads, "_server_binary_installed", lambda: True)
    return tmp_path


def test_happy_path_streams_verifies_and_renames(env):
    mgr = downloads.DownloadManager(fetcher=chunked_fetcher(PAYLOAD))
    spec = make_spec()
    mgr.run_sync(spec)
    assert paths.model_path(spec.id).read_bytes() == PAYLOAD
    assert not paths.model_path(spec.id).with_suffix(".gguf.part").exists()
    status = mgr.status(spec)
    assert status == {"state": "installed", "progress": 1.0, "error": None}


def test_checksum_mismatch_deletes_part_and_sets_error(env):
    mgr = downloads.DownloadManager(fetcher=chunked_fetcher(PAYLOAD))
    spec = make_spec(sha="0" * 64)
    mgr.run_sync(spec)
    status = mgr.status(spec)
    assert status["state"] == "error"
    assert "checksum" in status["error"]
    assert not paths.model_path(spec.id).exists()
    assert not paths.model_path(spec.id).with_suffix(".gguf.part").exists()


def test_disk_precheck_refuses(env, monkeypatch):
    monkeypatch.setattr(downloads, "_free_disk_bytes", lambda: 10)
    mgr = downloads.DownloadManager(fetcher=chunked_fetcher(PAYLOAD))
    with pytest.raises(InsufficientDiskError):
        mgr.start(make_spec())


def test_second_download_rejected_while_busy(env):
    mgr = downloads.DownloadManager(fetcher=chunked_fetcher(PAYLOAD))
    mgr._active = True  # simulate in-flight download
    with pytest.raises(DownloadBusyError):
        mgr.start(make_spec())


def test_fetch_failure_sets_error_and_cleans_part(env):
    def boom(url):
        yield b"partial"
        raise OSError("connection reset")

    mgr = downloads.DownloadManager(fetcher=boom)
    spec = make_spec()
    mgr.run_sync(spec)
    status = mgr.status(spec)
    assert status["state"] == "error"
    assert "download failed" in status["error"]
    assert not paths.model_path(spec.id).with_suffix(".gguf.part").exists()


def test_status_absent_then_installed_from_disk(env):
    mgr = downloads.DownloadManager(fetcher=chunked_fetcher(PAYLOAD))
    spec = make_spec()
    assert mgr.status(spec)["state"] == "absent"
    paths.models_dir().mkdir(parents=True, exist_ok=True)
    paths.model_path(spec.id).write_bytes(PAYLOAD)
    assert mgr.status(spec)["state"] == "installed"
