"""REST endpoints for the local model subsystem, mounted on the dashboard
app. Exposes no key material; error detail is always a friendly message."""

from __future__ import annotations

import shutil
import subprocess
import sys
from typing import Optional

from fastapi import FastAPI, HTTPException

from hermes_cli.local_llm import catalog, downloads, paths, runtime
from hermes_cli.local_llm.errors import (
    DownloadBusyError,
    InsufficientDiskError,
    LocalLLMError,
)

_GIB = 2**30


def _detected_ram_gb() -> float:
    try:
        import psutil

        return round(psutil.virtual_memory().total / _GIB, 1)
    except Exception:  # noqa: BLE001 - fall through to platform probes
        pass
    try:
        if sys.platform == "darwin":
            out = subprocess.check_output(["sysctl", "-n", "hw.memsize"], timeout=5)
            return round(int(out.strip()) / _GIB, 1)
        if sys.platform.startswith("linux"):
            with open("/proc/meminfo") as fh:
                for line in fh:
                    if line.startswith("MemTotal:"):
                        kb = int(line.split()[1])
                        return round(kb * 1024 / _GIB, 1)
    except Exception:  # noqa: BLE001 - detection is best-effort
        pass
    return 0.0


def _free_disk_gb() -> float:
    root = paths.local_llm_root()
    probe = root if root.exists() else paths.local_llm_root().parent
    if not probe.exists():
        from pathlib import Path

        probe = Path.home()
    return round(shutil.disk_usage(probe).free / _GIB, 1)


def _clean_stale_parts() -> None:
    """Interrupted downloads leave .part files; spec says they are cleaned on
    next startup (and on retry, which downloads.py already does)."""
    for directory in (paths.models_dir(), paths.bin_dir()):
        if directory.exists():
            for part in directory.glob("*.part"):
                part.unlink(missing_ok=True)


def register_local_llm_routes(
    app: FastAPI, manager: Optional[downloads.DownloadManager] = None
) -> None:
    mgr = manager or downloads.MANAGER
    _clean_stale_parts()

    @app.get("/api/local/models")
    async def local_models() -> dict:
        ram = _detected_ram_gb()
        fit = catalog.best_fit(ram)
        models = []
        for spec in catalog.CATALOG:
            status = mgr.status(spec)
            models.append(
                {
                    "id": spec.id,
                    "label": spec.label,
                    "size_bytes": spec.size_bytes,
                    "min_ram_gb": spec.min_ram_gb,
                    "description": spec.description,
                    "state": status["state"],
                    "progress": status["progress"],
                    "error": status["error"],
                    "recommended": fit is not None and fit.id == spec.id,
                }
            )
        return {
            "available": catalog.server_binary_spec() is not None,
            "detected_ram_gb": ram,
            "free_disk_gb": _free_disk_gb(),
            "models": models,
        }

    @app.post("/api/local/models/{model_id}/download", status_code=202)
    async def start_download(model_id: str) -> dict:
        spec = catalog.get_spec(model_id)
        if spec is None:
            raise HTTPException(status_code=404, detail="unknown model")
        try:
            mgr.start(spec)
        except (DownloadBusyError, InsufficientDiskError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except LocalLLMError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True}

    @app.delete("/api/local/models/{model_id}")
    async def delete_model(model_id: str) -> dict:
        spec = catalog.get_spec(model_id)
        if spec is None:
            raise HTTPException(status_code=404, detail="unknown model")
        gguf = paths.model_path(model_id)
        if not gguf.exists():
            raise HTTPException(status_code=404, detail="model not installed")
        if runtime.current_model() == model_id:
            runtime.stop()
        gguf.unlink()
        mgr.clear(model_id)
        return {"ok": True}
