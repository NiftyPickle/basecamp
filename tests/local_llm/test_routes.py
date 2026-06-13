import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hermes_cli.local_llm import catalog, downloads, paths, routes
from hermes_cli.local_llm.errors import DownloadBusyError, InsufficientDiskError


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setattr(routes, "_detected_ram_gb", lambda: 16.0)
    monkeypatch.setattr(routes, "_free_disk_gb", lambda: 100.0)
    app = FastAPI()
    manager = downloads.DownloadManager(fetcher=lambda url: iter([b""]))
    routes.register_local_llm_routes(app, manager=manager)
    return TestClient(app), manager


def test_get_models_shape_and_recommended(client):
    http, _ = client
    body = http.get("/api/local/models").json()
    assert body["available"] is True
    assert body["detected_ram_gb"] == 16.0
    assert body["free_disk_gb"] == 100.0
    models = body["models"]
    assert [m["id"] for m in models] == [s.id for s in catalog.CATALOG]
    rec = [m["id"] for m in models if m["recommended"]]
    assert rec == ["qwen2.5-7b-instruct-q4"]  # best fit for 16 GB
    first = models[0]
    for key in ("label", "size_bytes", "min_ram_gb", "description", "state",
                "progress", "error"):
        assert key in first
    assert first["state"] == "absent"


def test_unavailable_platform(client, monkeypatch):
    http, _ = client
    monkeypatch.setattr(routes.catalog, "server_binary_spec", lambda: None)
    body = http.get("/api/local/models").json()
    assert body["available"] is False


def test_download_unknown_id_404(client):
    http, _ = client
    assert http.post("/api/local/models/nope/download").status_code == 404


def test_download_accepted_202(client, monkeypatch):
    http, manager = client
    started = []
    monkeypatch.setattr(manager, "start", lambda spec: started.append(spec.id))
    resp = http.post("/api/local/models/qwen2.5-7b-instruct-q4/download")
    assert resp.status_code == 202
    assert started == ["qwen2.5-7b-instruct-q4"]


def test_download_busy_409(client, monkeypatch):
    http, manager = client

    def busy(spec):
        raise DownloadBusyError("another download is already running")

    monkeypatch.setattr(manager, "start", busy)
    resp = http.post("/api/local/models/qwen2.5-7b-instruct-q4/download")
    assert resp.status_code == 409
    assert resp.json()["detail"] == "another download is already running"


def test_download_disk_409(client, monkeypatch):
    http, manager = client

    def no_disk(spec):
        raise InsufficientDiskError("not enough free disk space for this download")

    monkeypatch.setattr(manager, "start", no_disk)
    resp = http.post("/api/local/models/qwen2.5-7b-instruct-q4/download")
    assert resp.status_code == 409


def test_delete_not_installed_404(client):
    http, _ = client
    assert http.delete("/api/local/models/qwen2.5-7b-instruct-q4").status_code == 404


def test_delete_installed_stops_server_and_removes(client, monkeypatch):
    http, _ = client
    paths.models_dir().mkdir(parents=True, exist_ok=True)
    paths.model_path("qwen2.5-7b-instruct-q4").write_bytes(b"gguf")
    stopped = []
    monkeypatch.setattr(
        routes.runtime, "current_model", lambda: "qwen2.5-7b-instruct-q4"
    )
    monkeypatch.setattr(routes.runtime, "stop", lambda: stopped.append(True))
    resp = http.delete("/api/local/models/qwen2.5-7b-instruct-q4")
    assert resp.status_code == 200
    assert stopped == [True]
    assert not paths.model_path("qwen2.5-7b-instruct-q4").exists()


def test_register_cleans_stale_part_files(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    paths.models_dir().mkdir(parents=True, exist_ok=True)
    stale = paths.models_dir() / "x.gguf.part"
    stale.write_bytes(b"junk")
    routes.register_local_llm_routes(
        FastAPI(),
        manager=downloads.DownloadManager(fetcher=lambda url: iter([b""])),
    )
    assert not stale.exists()
