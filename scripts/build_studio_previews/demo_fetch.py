"""Downloads public demo assets and keeps video previews small.

fetch_demo pulls a rights-clean demo file over plain HTTPS (no credentials
exist or are needed in this script). reencode_video shrinks oversized clips
with ffmpeg so committed previews stay lightweight.
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import urllib.request

_log = logging.getLogger(__name__)

_DOWNLOAD_TIMEOUT_SECONDS = 120

MAX_VIDEO_BYTES = 3 * 1024 * 1024  # blobs live in git history forever; keep clips small

FFMPEG_ARGS = [
    "-vf", "scale='min(720,iw)':-2", "-an",
    "-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
]

_STDERR_TAIL_CHARS = 2000


def _http_get(url: str) -> bytes:
    with urllib.request.urlopen(  # noqa: S310 - fixed catalog of public https URLs
        url, timeout=_DOWNLOAD_TIMEOUT_SECONDS
    ) as resp:
        return resp.read()


def fetch_demo(url: str) -> bytes:
    """Download a demo asset; raise ValueError on an empty body."""
    _log.info("fetching %s", url)
    data = _http_get(url)
    if not data:
        raise ValueError(f"empty response body from {url}")
    return data


def needs_reencode(data: bytes, media_type: str) -> bool:
    return media_type == "video" and len(data) > MAX_VIDEO_BYTES


def reencode_video(data: bytes) -> bytes:
    """Shrink a video with ffmpeg; raise RuntimeError on a non-zero exit."""
    in_fd, in_path = tempfile.mkstemp(suffix=".mp4")
    out_fd, out_path = tempfile.mkstemp(suffix=".mp4")
    os.close(out_fd)
    try:
        with os.fdopen(in_fd, "wb") as f:
            f.write(data)
        argv = ["ffmpeg", "-y", "-i", in_path, *FFMPEG_ARGS, out_path]
        proc = subprocess.run(argv, capture_output=True, text=True)
        if proc.returncode != 0:
            tail = (proc.stderr or "")[-_STDERR_TAIL_CHARS:]
            raise RuntimeError(f"ffmpeg failed (exit {proc.returncode}): {tail}")
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        for path in (in_path, out_path):
            try:
                os.remove(path)
            except OSError:
                pass
