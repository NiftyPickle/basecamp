import subprocess

import pytest

from build_studio_previews import demo_fetch


def test_fetch_demo_returns_body_bytes(monkeypatch):
    monkeypatch.setattr(demo_fetch, "_http_get", lambda url: b"demo-bytes")
    assert demo_fetch.fetch_demo("https://example.com/a.mp4") == b"demo-bytes"


def test_fetch_demo_rejects_empty_body(monkeypatch):
    monkeypatch.setattr(demo_fetch, "_http_get", lambda url: b"")
    with pytest.raises(ValueError):
        demo_fetch.fetch_demo("https://example.com/a.mp4")


def test_needs_reencode_thresholds():
    assert demo_fetch.needs_reencode(b"x" * (demo_fetch.MAX_VIDEO_BYTES + 1), "video")
    assert not demo_fetch.needs_reencode(b"x" * 1024, "video")
    assert not demo_fetch.needs_reencode(b"x" * (demo_fetch.MAX_VIDEO_BYTES + 1), "image")


def test_reencode_video_returns_output_bytes(monkeypatch):
    def fake_run(argv, capture_output, text):
        # ffmpeg argv ends with the output path; write the "re-encoded" bytes there.
        with open(argv[-1], "wb") as f:
            f.write(b"smaller-bytes")
        return subprocess.CompletedProcess(argv, 0, stdout="", stderr="")

    monkeypatch.setattr(demo_fetch.subprocess, "run", fake_run)
    assert demo_fetch.reencode_video(b"original-bytes") == b"smaller-bytes"


def test_reencode_video_raises_on_ffmpeg_failure(monkeypatch):
    def fake_run(argv, capture_output, text):
        return subprocess.CompletedProcess(argv, 1, stdout="", stderr="boom: codec error")

    monkeypatch.setattr(demo_fetch.subprocess, "run", fake_run)
    with pytest.raises(RuntimeError, match="codec error"):
        demo_fetch.reencode_video(b"original-bytes")
