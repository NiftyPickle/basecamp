"""MUAPI proxy client.

Wraps the ``muapi-cli`` binary in a small, injectable, testable unit. Knows
nothing about HTTP or FastAPI. The MUAPI API key is read server-side, injected
into the subprocess environment, and never echoed into logs, errors, or return
values.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Callable, Optional


logger = logging.getLogger(__name__)

ALLOWED_CATEGORIES = {"image", "video"}
ALLOWED_EFFECT_MODES = {"video", "image"}

# The ai-video-effects endpoint defaults its prompt to "a cute kitten" server-side,
# which would skew results for arbitrary user photos. Always send a neutral prompt.
AI_EFFECT_DEFAULT_PROMPT = "the main subject of the photo"

# Enhance ops whose CLI takes a single positional IMAGE_URL. face-swap is
# excluded here because it has a two-URL shape (handled by submit_face_swap).
# erase is excluded because the CLI requires --mask (support deferred).
ALLOWED_ENHANCE_OPS = {
    "upscale", "bg-remove", "skin", "colorize", "ghibli",
    "anime", "extend", "product-shot",
}
ALLOWED_FACE_SWAP_MODES = {"image", "video"}

# CLI exit code -> structured error code. Codes absent here map to "unknown".
EXIT_CODE_MAP = {
    3: "auth",
    4: "rate_limited",
    5: "not_found",
    6: "billing",
    7: "timeout",
    8: "validation",
}

# Whitelisted generation params mapped to their muapi-cli flags. Anything not
# in this map is ignored so the surface stays additive and injection-safe.
PARAM_FLAGS = {
    "width": "--width",
    "height": "--height",
    "aspect_ratio": "--aspect-ratio",
    "num_images": "--num-images",
    "duration": "--duration",
    "seed": "--seed",
    "negative_prompt": "--negative-prompt",
}

_STATUS_MAP = {
    "completed": "completed",
    "success": "completed",
    "succeeded": "completed",
    "done": "completed",
    "finished": "completed",
    "processing": "running",
    "running": "running",
    "in_progress": "running",
    "started": "running",
    "pending": "pending",
    "queued": "pending",
    "created": "pending",
    "submitted": "pending",
    "failed": "failed",
    "error": "failed",
    "canceled": "failed",
    "cancelled": "failed",
}

_UNSET = object()


@dataclass(frozen=True)
class RunResult:
    exit_code: int
    stdout: str
    stderr: str


class MuapiError(Exception):
    """Structured failure. ``code`` is one of: auth, rate_limited, not_found,
    billing, timeout, validation, unavailable, unknown."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def normalize_status(raw, outputs=None, error=None) -> str:
    key = str(raw or "").strip().lower()
    if key in _STATUS_MAP:
        return _STATUS_MAP[key]
    if error:
        return "failed"
    if outputs:
        return "completed"
    return "pending"


def _default_run(argv, env, timeout) -> RunResult:
    proc = subprocess.run(
        argv, env=env, capture_output=True, text=True, timeout=timeout
    )
    return RunResult(proc.returncode, proc.stdout, proc.stderr)


def _default_api_key() -> str:
    value = None
    try:
        from hermes_cli.config import load_env

        value = load_env().get("MUAPI_API_KEY")
    except Exception as exc:
        # load_env failures are about file/import (corrupt .env, import
        # error), never the secret value itself, so logging the exception
        # cannot leak the key. Surface it so misconfiguration is diagnosable.
        logger.warning("MUAPI key lookup via load_env failed: %s", exc)
        value = None
    return (value or os.environ.get("MUAPI_API_KEY") or "").strip()


def _scrub(text: str, key: Optional[str]) -> str:
    key = (key or "").strip()
    msg = (text or "").strip() or "muapi-cli error"
    if key:
        msg = msg.replace(key, "***")
    return msg[:500]


class MuapiClient:
    def __init__(
        self,
        run: Optional[Callable] = None,
        binary_path=_UNSET,
        api_key_provider: Optional[Callable[[], str]] = None,
        timeout: float = 120.0,
    ):
        self._run = run or _default_run
        self._binary = shutil.which("muapi") if binary_path is _UNSET else binary_path
        self._api_key_provider = api_key_provider or _default_api_key
        self._timeout = timeout

    def is_available(self) -> bool:
        return bool(self._binary)

    def has_key(self) -> bool:
        return bool(self._api_key_provider())

    def _invoke(self, argv):
        if not self.is_available():
            raise MuapiError("unavailable", "muapi-cli not installed")
        key = self._api_key_provider()
        ambient = os.environ.get("MUAPI_API_KEY")
        env = dict(os.environ)
        env.pop("MUAPI_API_KEY", None)
        if key:
            env["MUAPI_API_KEY"] = key
        full = [self._binary, *argv]
        try:
            res = self._run(full, env, self._timeout)
        except subprocess.TimeoutExpired as exc:
            raise MuapiError("timeout", "muapi-cli timed out") from exc
        if res.exit_code != 0:
            code = EXIT_CODE_MAP.get(res.exit_code, "unknown")
            raise MuapiError(code, _scrub(res.stderr, key or ambient))
        try:
            return json.loads(res.stdout)
        except (json.JSONDecodeError, ValueError) as exc:
            raise MuapiError("unknown", "invalid JSON from muapi-cli") from exc

    def submit(self, category, model, prompt, params=None):
        if category not in ALLOWED_CATEGORIES:
            raise MuapiError("validation", f"unsupported category: {category}")
        if not (prompt and prompt.strip()):
            raise MuapiError("validation", "prompt is required")
        if not (model and model.strip()):
            raise MuapiError("validation", "model is required")
        argv = [category, "generate", prompt, "--model", model, "--no-wait", "--output-json"]
        for name, flag in PARAM_FLAGS.items():
            if params and params.get(name) is not None:
                argv += [flag, str(params[name])]
        return self._submit_argv(argv)

    def _submit_argv(self, argv):
        """Run a submit-style argv (already includes --no-wait --output-json),
        extract and validate a request_id, return {'request_id': str}."""
        data = self._invoke(argv)
        request_id = data.get("request_id") if isinstance(data, dict) else None
        if request_id is None or (isinstance(request_id, str) and not request_id.strip()):
            raise MuapiError("unknown", "muapi-cli did not return a request_id")
        return {"request_id": str(request_id)}

    def submit_image_edit(self, model, prompt, image_url, params=None):
        if not (model and model.strip()):
            raise MuapiError("validation", "model is required")
        if not (prompt and prompt.strip()):
            raise MuapiError("validation", "prompt is required")
        if not (image_url and str(image_url).strip()):
            raise MuapiError("validation", "image_url is required")
        argv = [
            "image", "edit", prompt,
            "--image", str(image_url),
            "--model", model,
            "--no-wait", "--output-json",
        ]
        for name, flag in PARAM_FLAGS.items():
            if params and params.get(name) is not None:
                argv += [flag, str(params[name])]
        return self._submit_argv(argv)

    def submit_video_from_image(self, model, prompt, image_url, params=None):
        if not (model and model.strip()):
            raise MuapiError("validation", "model is required")
        if not (prompt and prompt.strip()):
            raise MuapiError("validation", "prompt is required")
        if not (image_url and str(image_url).strip()):
            raise MuapiError("validation", "image_url is required")
        argv = [
            "video", "from-image", prompt,
            "--image", str(image_url),
            "--model", model,
            "--no-wait", "--output-json",
        ]
        for name, flag in PARAM_FLAGS.items():
            if params and params.get(name) is not None:
                argv += [flag, str(params[name])]
        return self._submit_argv(argv)

    def submit_effect(self, mode, effect, image_url=None, video_url=None, params=None):
        # params accepted for signature uniformity; muapi edit effects takes no generation params.
        if mode not in ALLOWED_EFFECT_MODES:
            raise MuapiError("validation", f"unsupported effect mode: {mode}")
        if not (effect and str(effect).strip()):
            raise MuapiError("validation", "effect is required")
        argv = ["edit", "effects", "--effect", str(effect), "--mode", mode]
        if mode == "video":
            if not (video_url and str(video_url).strip()):
                raise MuapiError("validation", f"video_url is required for {mode} effects")
            argv += ["--video", str(video_url)]
        else:  # image
            if not (image_url and str(image_url).strip()):
                raise MuapiError("validation", f"image_url is required for {mode} effects")
            argv += ["--image", str(image_url)]
        argv += ["--no-wait", "--output-json"]
        return self._submit_argv(argv)

    def submit_ai_video_effect(self, effect, image_url, prompt=None):
        """Submit an ai-video-effects job (image in -> video out) via ``muapi run``."""
        if not (effect and str(effect).strip()):
            raise MuapiError("validation", "effect is required")
        self._require_http_url(image_url, "image_url")
        argv = [
            "run", "ai-video-effects",
            "-i", f"image_url={image_url}",
            "-i", f"effect={effect}",
            "-p", prompt or AI_EFFECT_DEFAULT_PROMPT,
            "--no-wait", "--output-json",
        ]
        return self._submit_argv(argv)

    @staticmethod
    def _require_http_url(value, field):
        if not (value and str(value).strip()):
            raise MuapiError("validation", f"{field} is required")
        if not str(value).strip().startswith(("http://", "https://")):
            raise MuapiError("validation", f"{field} must be an http(s) URL")

    def submit_enhance(self, operation, image_url, params=None):
        # params accepted for signature uniformity across submit methods;
        # muapi enhance ops take no extra generation params.
        if operation not in ALLOWED_ENHANCE_OPS:
            raise MuapiError("validation", f"unsupported enhance operation: {operation}")
        self._require_http_url(image_url, "image_url")
        argv = ["enhance", operation, str(image_url), "--no-wait", "--output-json"]
        return self._submit_argv(argv)

    def submit_face_swap(self, source_url, target_url, mode="image"):
        self._require_http_url(source_url, "source_url")
        self._require_http_url(target_url, "target_url")
        if mode not in ALLOWED_FACE_SWAP_MODES:
            raise MuapiError("validation", f"unsupported face-swap mode: {mode}")
        argv = [
            "enhance", "face-swap",
            "--source", str(source_url),
            "--target", str(target_url),
            "--mode", mode,
            "--no-wait", "--output-json",
        ]
        return self._submit_argv(argv)

    @staticmethod
    def _extract_url(data):
        if not isinstance(data, dict):
            return None
        for key in ("url", "file_url", "hosted_url", "output_url", "public_url"):
            v = data.get(key)
            if isinstance(v, str) and v.strip():
                return v
        nested = data.get("result")
        if isinstance(nested, dict):
            return MuapiClient._extract_url(nested)
        return None

    def upload(self, file_path):
        if not (file_path and str(file_path).strip()):
            raise MuapiError("validation", "file_path is required")
        data = self._invoke(["upload", "file", str(file_path), "--output-json"])
        url = self._extract_url(data)
        if not url:
            raise MuapiError("unknown", "muapi-cli did not return a hosted url")
        return {"url": url}

    def result(self, request_id):
        if not (request_id and str(request_id).strip()):
            raise MuapiError("validation", "request_id is required")
        data = self._invoke(["predict", "result", str(request_id), "--output-json"])
        if not isinstance(data, dict):
            data = {}
        raw_outputs = data.get("outputs")
        outputs = raw_outputs if isinstance(raw_outputs, list) else []
        error = data.get("error")
        status = normalize_status(data.get("status"), outputs, error)
        return {"status": status, "outputs": outputs, "error": error}

    def list_models(self, category=None):
        if category is not None and category not in ALLOWED_CATEGORIES:
            raise MuapiError("validation", f"unsupported category: {category}")
        argv = ["models", "list"]
        if category is not None:
            argv += ["--category", category]
        argv += ["--output-json"]
        data = self._invoke(argv)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            models = data.get("models")
            return models if isinstance(models, list) else []
        return []
