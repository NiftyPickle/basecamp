"""Local preview storage: writes downloaded effect outputs into the web app's
public directory so previews ship inside the bundle (no external hosting).
Files land in <previews_dir>/<effect_key>.<ext>; the manifest references them
by the relative URL /studio-previews/<effect_key>.<ext>."""

from __future__ import annotations

import os

_URL_PREFIX = "/studio-previews"


def preview_filename(effect_key: str, ext: str) -> str:
    return f"{effect_key}.{ext}"


def preview_url(effect_key: str, ext: str) -> str:
    return f"{_URL_PREFIX}/{preview_filename(effect_key, ext)}"


def existing_preview(previews_dir: str, effect_key: str, ext: str) -> str | None:
    """Return the relative URL if the file already exists (and is non-empty), else None."""
    path = os.path.join(previews_dir, preview_filename(effect_key, ext))
    if os.path.isfile(path) and os.path.getsize(path) > 0:
        return preview_url(effect_key, ext)
    return None


def write_preview(previews_dir: str, effect_key: str, ext: str, data: bytes) -> str:
    """Atomically write the preview file and return its relative URL."""
    if not data:
        raise ValueError(f"refusing to write empty preview for {effect_key}")
    os.makedirs(previews_dir, exist_ok=True)
    path = os.path.join(previews_dir, preview_filename(effect_key, ext))
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    return preview_url(effect_key, ext)
