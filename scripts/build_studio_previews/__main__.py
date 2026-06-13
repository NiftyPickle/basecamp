"""Live entrypoint. Wires the real demo downloader + local preview store into
build_previews.

No credentials needed: every asset is a public, rights-clean demo file.
Downloads land in web/public/studio-previews/ so previews ship inside the app
bundle; the manifest stores relative /studio-previews/ URLs.
Usage: python -m build_studio_previews [--out web/public/studio-previews.json]
                                       [--previews-dir web/public/studio-previews]
                                       [--only KEY[,KEY...]]
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from typing import Iterable

from .catalog import EFFECTS, EffectSpec
from .demo_fetch import fetch_demo, reencode_video
from .local_store import _URL_PREFIX
from .main import build_previews


def _filter_effects(effects: Iterable[EffectSpec], only: "str | None") -> list[EffectSpec]:
    """Filter the catalog to a comma-separated key list; None means all."""
    effects = list(effects)
    if not only:
        return effects
    wanted = list(dict.fromkeys(k.strip() for k in only.split(",") if k.strip()))
    by_key = {e.key: e for e in effects}
    unknown = [k for k in wanted if k not in by_key]
    if unknown:
        valid = ", ".join(e.key for e in effects)
        raise RuntimeError(
            f"unknown effect key(s): {', '.join(unknown)}; valid keys: {valid}"
        )
    return [by_key[k] for k in wanted]


def _probe_writable(previews_dir: str) -> None:
    """Create the previews dir and prove it is writable by round-tripping a
    probe file. Raises OSError on failure, before any download."""
    os.makedirs(previews_dir, exist_ok=True)
    probe = os.path.join(previews_dir, ".write-probe.tmp")
    with open(probe, "wb") as f:
        f.write(b"probe")
    os.remove(probe)


def main() -> int:
    parser = argparse.ArgumentParser(prog="build_studio_previews")
    parser.add_argument("--out", default="web/public/studio-previews.json")
    parser.add_argument("--previews-dir", default="web/public/studio-previews")
    parser.add_argument(
        "--only", default=None,
        help="comma-separated effect keys to build (staged runs); default all",
    )
    args = parser.parse_args()

    effects = _filter_effects(EFFECTS, args.only)

    # Preflight: surface startup failures before the first download.
    if shutil.which("ffmpeg") is None:
        print("error: ffmpeg not found on PATH", file=sys.stderr)
        return 1
    # The manifest stores _URL_PREFIX-relative URLs, so the previews dir must
    # be the matching public subdirectory or the frontend cannot resolve them.
    expected_basename = _URL_PREFIX.lstrip("/")
    if os.path.basename(os.path.normpath(args.previews_dir)) != expected_basename:
        print(
            f"error: previews dir {args.previews_dir!r} must be named "
            f"{expected_basename!r} to match manifest URLs",
            file=sys.stderr,
        )
        return 1
    try:
        _probe_writable(args.previews_dir)
    except OSError as exc:
        print(
            f"error: previews dir {args.previews_dir!r} is not writable: {exc}",
            file=sys.stderr,
        )
        return 1

    build_previews(
        effects=effects,
        manifest_path=args.out,
        previews_dir=args.previews_dir,
        fetch=fetch_demo,
        reencode=reencode_video,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
