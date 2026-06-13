"""Lipsync model registry for the studio lipsync tab.

Maps MUAPI lipsync model slugs to their request contracts so the route can
validate and shape payloads in one place. Raises ValueError on contract
violations; the route layer converts those to 400 validation errors.
"""

from __future__ import annotations

from dataclasses import dataclass

LIPSYNC_RESOLUTIONS = ("480p", "720p", "1080p")
LIPSYNC_DEFAULT_RESOLUTION = "720p"


@dataclass(frozen=True)
class LipsyncModel:
    slug: str
    label: str
    # "video" models redub an existing video; "audio" (LTX) models drive a
    # generated talking video from audio plus optional image/prompt.
    kind: str
    supports_seed: bool = False


LIPSYNC_MODELS: dict[str, LipsyncModel] = {
    m.slug: m
    for m in (
        LipsyncModel("latentsync-video", "LatentSync (video redub)", "video"),
        LipsyncModel("creatify-lipsync", "Creatify (video redub)", "video"),
        LipsyncModel("ltx-2-19b-lipsync", "LTX 2 19B (audio driven)", "audio"),
        LipsyncModel(
            "ltx-2.3-lipsync", "LTX 2.3 (audio driven)", "audio", supports_seed=True
        ),
    )
}


def _require_url(fields: dict, name: str) -> str:
    value = fields.get(name)
    if not isinstance(value, str):
        raise ValueError(f"{name} is required")
    stripped = value.strip()
    if not stripped:
        raise ValueError(f"{name} is required")
    if not stripped.startswith(("http://", "https://")):
        raise ValueError(f"{name} must be an http(s) URL")
    return stripped


def build_lipsync_payload(model: str, fields: dict) -> dict:
    spec = LIPSYNC_MODELS.get(model)
    if spec is None:
        raise ValueError(f"unknown lipsync model: {model}")

    payload = {"audio_url": _require_url(fields, "audio_url")}

    if spec.kind == "video":
        payload["video_url"] = _require_url(fields, "video_url")
        for forbidden in ("image_url", "prompt", "resolution", "seed"):
            if fields.get(forbidden) not in (None, ""):
                raise ValueError(f"{forbidden} is not supported by {model}")
        return payload

    # audio-driven (LTX) models
    if fields.get("video_url") not in (None, ""):
        raise ValueError(f"video_url is not supported by {model}")
    image_url = fields.get("image_url")
    if image_url not in (None, ""):
        payload["image_url"] = _require_url(fields, "image_url")
    prompt = fields.get("prompt")
    if isinstance(prompt, str) and prompt.strip():
        payload["prompt"] = prompt.strip()
    resolution = fields.get("resolution") or LIPSYNC_DEFAULT_RESOLUTION
    if resolution not in LIPSYNC_RESOLUTIONS:
        raise ValueError(f"resolution must be one of {LIPSYNC_RESOLUTIONS}")
    payload["resolution"] = resolution
    seed = fields.get("seed")
    if seed is not None:
        if not spec.supports_seed:
            raise ValueError(f"seed is not supported by {model}")
        try:
            payload["seed"] = int(seed)
        except (TypeError, ValueError):
            raise ValueError("seed must be an integer")
    return payload
