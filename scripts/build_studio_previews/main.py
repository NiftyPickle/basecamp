"""Orchestrates the preview build: for each pending effect, download its demo
asset, re-encode oversized videos, store the file locally, merge into the
manifest, save after every success (so a crash is resumable). Network and
ffmpeg functions are injected so the core is unit-tested."""

from __future__ import annotations

from typing import Callable, Iterable

from .catalog import EffectSpec
from .demo_fetch import needs_reencode
from .local_store import existing_preview, write_preview
from .manifest import PreviewMap, load_manifest, merge_entry, pending_keys, save_manifest

Fetch = Callable[[str], bytes]
Reencode = Callable[[bytes], bytes]

_KNOWN_MODES = ("ai", "image")


def ext_for_mode(mode: str) -> str:
    if mode not in _KNOWN_MODES:
        raise ValueError(f"unsupported effect mode: {mode!r}")
    return "mp4" if mode == "ai" else "jpg"


def media_type_for_mode(mode: str) -> str:
    if mode not in _KNOWN_MODES:
        raise ValueError(f"unsupported effect mode: {mode!r}")
    return "video" if mode == "ai" else "image"


def build_previews(
    effects: Iterable[EffectSpec],
    manifest_path: str,
    previews_dir: str,
    fetch: Fetch,
    reencode: Reencode,
) -> PreviewMap:
    effects = list(effects)
    manifest = load_manifest(manifest_path)
    by_key = {e.key: e for e in effects}

    for key in pending_keys(effects, manifest):
        spec = by_key[key]
        ext = ext_for_mode(spec.mode)
        media_type = media_type_for_mode(spec.mode)
        url = existing_preview(previews_dir, key, ext)
        if url is None:
            data = fetch(spec.demo_url)
            if needs_reencode(data, media_type):
                data = reencode(data)
            url = write_preview(previews_dir, key, ext, data)
        manifest = merge_entry(manifest, key, url, media_type)
        save_manifest(manifest_path, manifest)  # checkpoint each success
        print(f"done {key} -> {url}")

    return manifest
