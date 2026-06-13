"""Desktop-shell-only bridge endpoints, mounted on the dashboard app.

Registered ONLY when running inside the Sidekick desktop shell
(``HERMES_DESKTOP=1``). The shell points its single WKWebView/wry webview at
the dashboard origin, and that webview swallows ``target="_blank"`` external
link clicks - so a plain anchor to an outside site (e.g. the OpenRouter key
page on the Free chat onboarding card) opens nothing. This route lets the SPA
hand such URLs to the host OS default browser.

Never registered for a publicly-served dashboard: opening a browser on the
*server* host is meaningless off a local desktop process and would be a
request-forgery surface. The caller gates registration on the desktop env.

Exposes no key material; ``detail`` is always a short friendly message.
"""

from __future__ import annotations

import subprocess
import webbrowser
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Only ever hand the host browser real web URLs. Blocks ``file:``,
# ``javascript:``, ``data:`` and friends from reaching ``webbrowser.open``.
_ALLOWED_SCHEMES = {"http", "https"}

# A native macOS folder chooser. The prompt is a fixed literal - no caller
# input is ever interpolated, so there is no AppleScript-injection surface.
# ``POSIX path of`` yields an absolute path (with a trailing slash) the user
# explicitly picked; it still has to pass the organizer scope grant before any
# disk op touches it.
_CHOOSE_FOLDER_SCRIPT = (
    'POSIX path of (choose folder '
    'with prompt "Choose a folder for Basecamp to organize")'
)


class OpenExternalRequest(BaseModel):
    url: str


def is_safe_external_url(url: str) -> bool:
    """True only for ``http(s)://`` URLs that carry a network location."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme in _ALLOWED_SCHEMES and bool(parsed.netloc)


def _run_choose_folder() -> subprocess.CompletedProcess:
    """Invoke osascript's native folder chooser. macOS-only; raises
    FileNotFoundError off macOS where ``osascript`` is absent."""
    return subprocess.run(
        ["osascript", "-e", _CHOOSE_FOLDER_SCRIPT],
        capture_output=True,
        text=True,
        timeout=300,
    )


def choose_folder() -> dict:
    """Pop the native macOS folder picker.

    Returns ``{"path": "/abs/path"}`` on a pick or ``{"cancelled": True}`` when
    the user dismisses the dialog. Raises HTTPException for an unavailable or
    misbehaving picker. Never leaks stderr - ``detail`` stays a short message.
    """
    try:
        proc = _run_choose_folder()
    except FileNotFoundError as exc:
        # osascript ships only on macOS; the desktop build is macOS-only today.
        raise HTTPException(
            status_code=501, detail="folder picker unavailable"
        ) from exc
    except (OSError, subprocess.SubprocessError) as exc:
        raise HTTPException(
            status_code=502, detail="could not open folder picker"
        ) from exc

    if proc.returncode != 0:
        stderr = proc.stderr or ""
        # Cancel is the expected non-zero path: osascript reports error -128.
        if "-128" in stderr or "User canceled" in stderr:
            return {"cancelled": True}
        raise HTTPException(status_code=502, detail="could not open folder picker")

    path = (proc.stdout or "").strip().rstrip("/")
    if not path:
        return {"cancelled": True}
    return {"path": path}


def register_desktop_bridge_routes(app: FastAPI) -> None:
    @app.post("/api/open-external")
    async def open_external(body: OpenExternalRequest) -> dict:
        if not is_safe_external_url(body.url):
            raise HTTPException(status_code=400, detail="unsupported url")
        # new=2 asks for a new browser tab. On macOS this shells out to
        # ``open``, on Windows ``os.startfile``, on Linux ``xdg-open`` - all
        # run in the user's desktop session because the backend is their own
        # local child process.
        try:
            opened = webbrowser.open(body.url, new=2)
        except Exception as exc:  # noqa: BLE001 - never leak a stack trace
            raise HTTPException(
                status_code=502, detail="could not open browser"
            ) from exc
        if not opened:
            raise HTTPException(status_code=502, detail="could not open browser")
        return {"ok": True}

    @app.post("/api/choose-folder")
    async def choose_folder_route() -> dict:
        # Native OS folder chooser. The picked path is not trusted on its own -
        # the caller grants it through the organizer scope before any disk op.
        return choose_folder()
