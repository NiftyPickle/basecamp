"""Read/write the studio-previews.json map. All updates are immutable; the file
is the resume ledger - keys already present are skipped on rerun."""

from __future__ import annotations

import json
import logging
import os
from typing import Iterable, Literal

from .catalog import EffectSpec

_log = logging.getLogger(__name__)

PreviewMap = dict[str, dict[str, str]]

_MEDIA_TYPES = ("video", "image")


def _quarantine(path: str, reason: str) -> None:
    """Move a bad ledger aside so a rerun starts clean but evidence survives."""
    corrupt = path + ".corrupt"
    _log.warning("manifest at %s is %s; moving aside to %s", path, reason, corrupt)
    os.replace(path, corrupt)


def load_manifest(path: str) -> PreviewMap:
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as f:
            data = json.load(f)
    except json.JSONDecodeError:
        _quarantine(path, "not valid JSON")
        return {}
    except OSError as exc:
        _log.warning("could not read manifest at %s (%s); treating as empty", path, exc)
        return {}
    if not isinstance(data, dict):
        _quarantine(path, "not a JSON object")
        return {}
    return data


def save_manifest(path: str, data: PreviewMap) -> None:
    dirname = os.path.dirname(path)
    if dirname:
        os.makedirs(dirname, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)


def merge_entry(
    manifest: PreviewMap, key: str, url: str, media_type: Literal["video", "image"]
) -> PreviewMap:
    if media_type not in _MEDIA_TYPES:
        raise ValueError(
            f"invalid mediaType {media_type!r} for {key!r}; expected one of {_MEDIA_TYPES}"
        )
    return {**manifest, key: {"url": url, "mediaType": media_type}}


def pending_keys(effects: Iterable[EffectSpec], manifest: PreviewMap) -> list[str]:
    return [e.key for e in effects if e.key not in manifest]
