"""Tests for the desktop-only external-link bridge."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hermes_cli import desktop_bridge


@pytest.fixture
def client(monkeypatch):
    calls = []

    def fake_open(url, new=0, autoraise=True):
        calls.append(url)
        return True

    monkeypatch.setattr(desktop_bridge.webbrowser, "open", fake_open)
    app = FastAPI()
    desktop_bridge.register_desktop_bridge_routes(app)
    test_client = TestClient(app)
    test_client.opened = calls  # type: ignore[attr-defined]
    return test_client


@pytest.mark.parametrize(
    "url",
    ["https://openrouter.ai/keys", "http://example.com/path?q=1"],
)
def test_opens_allowed_schemes(client, url):
    res = client.post("/api/open-external", json={"url": url})
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert client.opened == [url]


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "javascript:alert(1)",
        "data:text/html,<h1>x</h1>",
        "not-a-url",
        "https://",  # scheme ok but no netloc
    ],
)
def test_rejects_unsafe_urls(client, url):
    res = client.post("/api/open-external", json={"url": url})
    assert res.status_code == 400
    assert res.json()["detail"] == "unsupported url"
    assert client.opened == []


def test_browser_failure_returns_502(client, monkeypatch):
    monkeypatch.setattr(
        desktop_bridge.webbrowser, "open", lambda url, new=0, autoraise=True: False
    )
    res = client.post("/api/open-external", json={"url": "https://example.com"})
    assert res.status_code == 502
    assert res.json()["detail"] == "could not open browser"


def test_is_safe_external_url_unit():
    assert desktop_bridge.is_safe_external_url("https://a.test")
    assert desktop_bridge.is_safe_external_url("http://a.test:8080/x")
    assert not desktop_bridge.is_safe_external_url("ftp://a.test")
    assert not desktop_bridge.is_safe_external_url("")


# --- native folder picker -------------------------------------------------


class _Proc:
    """Stand-in for subprocess.CompletedProcess in choose-folder tests."""

    def __init__(self, returncode: int, stdout: str = "", stderr: str = ""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def _picker_client(monkeypatch, fake_run):
    monkeypatch.setattr(desktop_bridge, "_run_choose_folder", fake_run)
    app = FastAPI()
    desktop_bridge.register_desktop_bridge_routes(app)
    return TestClient(app)


def test_choose_folder_returns_picked_path(monkeypatch):
    # osascript prints the POSIX path with a trailing slash and newline.
    client = _picker_client(
        monkeypatch, lambda: _Proc(0, stdout="/Users/me/Documents/\n")
    )
    res = client.post("/api/choose-folder")
    assert res.status_code == 200
    assert res.json() == {"path": "/Users/me/Documents"}


def test_choose_folder_cancel_is_not_an_error(monkeypatch):
    # Pressing Cancel: osascript exits non-zero with "User canceled. (-128)".
    client = _picker_client(
        monkeypatch,
        lambda: _Proc(1, stderr="execution error: User canceled. (-128)"),
    )
    res = client.post("/api/choose-folder")
    assert res.status_code == 200
    assert res.json() == {"cancelled": True}


def test_choose_folder_missing_osascript_returns_501(monkeypatch):
    def boom():
        raise FileNotFoundError("osascript")

    client = _picker_client(monkeypatch, boom)
    res = client.post("/api/choose-folder")
    assert res.status_code == 501
    assert res.json()["detail"] == "folder picker unavailable"


def test_choose_folder_other_failure_returns_502(monkeypatch):
    client = _picker_client(
        monkeypatch, lambda: _Proc(1, stderr="some unexpected osascript failure")
    )
    res = client.post("/api/choose-folder")
    assert res.status_code == 502
    assert res.json()["detail"] == "could not open folder picker"


def test_choose_folder_empty_output_is_cancel(monkeypatch):
    client = _picker_client(monkeypatch, lambda: _Proc(0, stdout="\n"))
    res = client.post("/api/choose-folder")
    assert res.status_code == 200
    assert res.json() == {"cancelled": True}
