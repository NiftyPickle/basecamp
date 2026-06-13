"""Checksummed, atomic model/binary downloads. One download at a time.

Flow per file: stream to ``<dest>.part`` hashing as we go, fsync, verify
sha256, atomic rename. A checksum mismatch deletes the partial file and
surfaces a friendly error. Progress lives in memory and is read by
routes.py; nothing here ever logs or returns raw upstream error bodies.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import tarfile
import threading
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable, Iterator, Optional

from hermes_cli.local_llm import catalog, paths
from hermes_cli.local_llm.errors import (
    DownloadBusyError,
    InsufficientDiskError,
    LocalLLMError,
)

_CHUNK_BYTES = 1024 * 1024
_DISK_HEADROOM = 1.1

Fetcher = Callable[[str], Iterator[bytes]]


def _http_fetcher(url: str) -> Iterator[bytes]:
    # Only ever called with pinned catalog URLs; redirects (HF -> CDN) are
    # fine because the sha256 check is the integrity gate, not the URL.
    with urllib.request.urlopen(url, timeout=60) as resp:
        while True:
            chunk = resp.read(_CHUNK_BYTES)
            if not chunk:
                return
            yield chunk


def _free_disk_bytes() -> int:
    root = paths.local_llm_root()
    probe = root if root.exists() else root.parent if root.parent.exists() else Path.home()
    return shutil.disk_usage(probe).free


def _server_binary_installed() -> bool:
    spec = catalog.server_binary_spec()
    if spec is None:
        return False
    return (paths.bin_dir() / spec.server_member).exists()


def _extract_archive(archive: Path, fmt: str, dest: Path) -> None:
    # Archive integrity is guaranteed by the pinned sha256 verified before
    # this call. filter="data" is defense in depth: it sanitizes member
    # paths so a tampered archive cannot escape dest via absolute or ../ paths.
    if fmt == "zip":
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(dest)
    else:
        with tarfile.open(archive, "r:gz") as tf:
            tf.extractall(dest, filter="data")


class DownloadManager:
    """In-memory download state machine. States per model id:
    absent | downloading | verifying | installed | error."""

    def __init__(self, fetcher: Optional[Fetcher] = None):
        self._fetcher = fetcher or _http_fetcher
        self._statuses: dict[str, dict] = {}
        self._mutex = threading.Lock()
        self._active = False

    # -- public API ----------------------------------------------------------

    def status(self, spec: catalog.LocalModelSpec) -> dict:
        with self._mutex:
            mem = self._statuses.get(spec.id)
            if mem is not None:
                return dict(mem)
        if paths.model_path(spec.id).exists():
            return {"state": "installed", "progress": 1.0, "error": None}
        return {"state": "absent", "progress": 0.0, "error": None}

    def busy(self) -> bool:
        with self._mutex:
            return self._active

    def start(self, spec: catalog.LocalModelSpec) -> None:
        """Validate and kick off a background download thread."""
        needed = spec.size_bytes
        if not _server_binary_installed():
            binary = catalog.server_binary_spec()
            if binary is None:
                raise LocalLLMError("local models are not supported on this platform")
            needed += binary.size_bytes
        if _free_disk_bytes() < needed * _DISK_HEADROOM:
            raise InsufficientDiskError(
                "not enough free disk space for this download"
            )
        with self._mutex:
            if self._active:
                raise DownloadBusyError("another download is already running")
            self._active = True
            self._statuses[spec.id] = {
                "state": "downloading",
                "progress": 0.0,
                "error": None,
            }
        thread = threading.Thread(target=self.run_sync, args=(spec,), daemon=True)
        thread.start()

    def clear(self, model_id: str) -> None:
        with self._mutex:
            self._statuses.pop(model_id, None)

    # -- worker --------------------------------------------------------------

    def run_sync(self, spec: catalog.LocalModelSpec) -> None:
        """Download (binary if needed, then model). Runs in the worker thread;
        also called directly by tests. Never raises - failures land in status."""
        try:
            self._set(spec.id, "downloading", 0.0)
            if not _server_binary_installed():
                self._install_server_binary()
            dest = paths.model_path(spec.id)
            self._download_file(
                spec.url, spec.sha256, spec.size_bytes, dest, track_id=spec.id
            )
            self._set(spec.id, "installed", 1.0)
        except LocalLLMError as exc:
            self._set(spec.id, "error", 0.0, error=str(exc))
        except Exception:  # noqa: BLE001 - never leak raw detail to the UI
            self._set(spec.id, "error", 0.0, error="download failed, retry allowed")
        finally:
            with self._mutex:
                self._active = False

    def _install_server_binary(self) -> None:
        binary = catalog.server_binary_spec()
        if binary is None:
            raise LocalLLMError("local models are not supported on this platform")
        suffix = ".zip" if binary.archive_format == "zip" else ".tar.gz"
        archive = paths.bin_dir() / f"llama-server-archive{suffix}"
        self._download_file(binary.url, binary.sha256, binary.size_bytes, archive)
        _extract_archive(archive, binary.archive_format, paths.bin_dir())
        archive.unlink(missing_ok=True)
        server = paths.bin_dir() / binary.server_member
        if not server.exists():
            raise LocalLLMError("local runtime install failed, retry allowed")
        server.chmod(0o755)

    def _download_file(
        self,
        url: str,
        sha256: str,
        size_bytes: int,
        dest: Path,
        track_id: Optional[str] = None,
    ) -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        part = dest.with_name(dest.name + ".part")
        part.unlink(missing_ok=True)
        digest = hashlib.sha256()
        written = 0
        try:
            with open(part, "wb") as fh:
                for chunk in self._fetcher(url):
                    fh.write(chunk)
                    digest.update(chunk)
                    written += len(chunk)
                    if track_id and size_bytes:
                        self._set(
                            track_id,
                            "downloading",
                            min(written / size_bytes, 1.0),
                        )
                fh.flush()
                os.fsync(fh.fileno())
        except LocalLLMError:
            part.unlink(missing_ok=True)
            raise
        except Exception as exc:
            part.unlink(missing_ok=True)
            raise LocalLLMError("download failed, retry allowed") from exc
        if track_id:
            self._set(track_id, "verifying", 1.0)
        if digest.hexdigest() != sha256:
            part.unlink(missing_ok=True)
            raise LocalLLMError("checksum mismatch, download removed")
        os.replace(part, dest)

    def _set(
        self, model_id: str, state: str, progress: float, error: Optional[str] = None
    ) -> None:
        with self._mutex:
            self._statuses[model_id] = {
                "state": state,
                "progress": progress,
                "error": error,
            }


MANAGER = DownloadManager()
