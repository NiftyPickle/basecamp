"""llama-server child process lifecycle. One server at a time; switching
models restarts it. Binds 127.0.0.1 only. All errors are friendly category
messages - raw stderr never reaches callers."""

from __future__ import annotations

import atexit
import socket
import subprocess
import time
from typing import Optional

from hermes_cli.local_llm import catalog, paths
from hermes_cli.local_llm.errors import LocalLLMError

_STARTUP_TIMEOUT_S = 120.0
_HEALTH_POLL_S = 0.5
_CTX_SIZE = "4096"

_proc: Optional[subprocess.Popen] = None
_model_id: Optional[str] = None
_base_url: Optional[str] = None


def _spawn(argv: list[str]) -> subprocess.Popen:
    return subprocess.Popen(
        argv,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _health_ok(base_url: str) -> bool:
    import requests

    try:
        return requests.get(f"{base_url}/health", timeout=1).status_code == 200
    except Exception:  # noqa: BLE001 - any failure just means "not yet"
        return False


def _sleep(seconds: float) -> None:
    time.sleep(seconds)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def current_model() -> Optional[str]:
    if _proc is not None and _proc.poll() is None:
        return _model_id
    return None


def stop() -> None:
    global _proc, _model_id, _base_url
    if _proc is not None and _proc.poll() is None:
        _proc.terminate()
        try:
            _proc.wait(timeout=10)
        except Exception:  # noqa: BLE001 - already terminating, best effort
            pass
    _proc = None
    _model_id = None
    _base_url = None


atexit.register(stop)


def ensure_running(model_id: str) -> str:
    """Start (or reuse) the llama-server for *model_id*; return its base URL.
    Blocking - call via asyncio.to_thread from async code."""
    global _proc, _model_id, _base_url

    spec = catalog.get_spec(model_id)
    if spec is None:
        raise LocalLLMError(f"unknown local model '{model_id}'")

    binary_spec = catalog.server_binary_spec()
    if binary_spec is None:
        raise LocalLLMError("local models are not supported on this platform")
    binary = paths.bin_dir() / binary_spec.server_member
    if not binary.exists():
        raise LocalLLMError(
            "local runtime not installed - download a model from the model picker"
        )
    gguf = paths.model_path(model_id)
    if not gguf.exists():
        raise LocalLLMError(
            "local model not installed - download it from the model picker"
        )

    if _proc is not None and _proc.poll() is None and _model_id == model_id:
        return _base_url  # type: ignore[return-value]

    stop()
    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"
    argv = [
        str(binary),
        "-m",
        str(gguf),
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "-c",
        _CTX_SIZE,
    ]
    try:
        proc = _spawn(argv)
    except OSError as exc:
        raise LocalLLMError("failed to start the local model server") from exc

    deadline = time.monotonic() + _STARTUP_TIMEOUT_S
    while True:
        if proc.poll() is not None:
            raise LocalLLMError("local model server exited during startup")
        if _health_ok(base_url):
            break
        if time.monotonic() >= deadline:
            proc.terminate()
            raise LocalLLMError("local model server did not become ready")
        _sleep(_HEALTH_POLL_S)

    _proc = proc
    _model_id = model_id
    _base_url = base_url
    return base_url
