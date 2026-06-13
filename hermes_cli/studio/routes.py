"""FastAPI routes for the MUAPI studio proxy.

Thin handlers over ``MuapiClient``. They know HTTP only; all subprocess and
JSON parsing lives in ``muapi_client``. Routes attach via
``register_studio_routes(app)`` and inherit the dashboard's existing ``/api/``
auth gate. The MUAPI key never appears in any response.
"""

from __future__ import annotations

import os
import tempfile
from typing import Optional

from fastapi import UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from hermes_cli.studio.muapi_client import MuapiClient, MuapiError
from hermes_cli.studio.muapi_http import MuapiHttpClient
from hermes_cli.studio.lipsync_models import build_lipsync_payload
from hermes_cli.studio.motions import (
    HF_DOP_DEFAULT_OPTION,
    HF_DOP_MOTION_SET,
    HF_DOP_OPTIONS,
)


# 80 MB cap on the handler's temp copy and the muapi hand-off. NOTE: Starlette's
# multipart parser spools the full request body to disk before this handler runs,
# so this is not a network-level intake guard. Acceptable for the localhost
# single-user dashboard; add a Content-Length guard if this ever faces a network.
MAX_UPLOAD_BYTES = 80 * 1024 * 1024
ALLOWED_UPLOAD_EXTS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp",
    ".mp4", ".mov", ".webm", ".m4v",
    ".mp3", ".wav", ".m4a",
}
_UPLOAD_CHUNK = 1024 * 1024


_HTTP_FOR = {
    "auth": 401,
    "billing": 402,
    "validation": 400,
    "not_found": 404,
    "rate_limited": 429,
    "unavailable": 503,
    "timeout": 504,
    "unknown": 502,
}


def _err(exc: MuapiError) -> JSONResponse:
    return JSONResponse(
        status_code=_HTTP_FOR.get(exc.code, 502),
        content={"error_code": exc.code, "message": exc.message},
    )


def _internal_err() -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error_code": "internal", "message": "internal error"},
    )


def _validation_err(message: str) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error_code": "validation", "message": message})


def _normalize_templates(data) -> list[dict]:
    """Defensive shaping of the upstream template list. Accepts a bare list
    or a dict wrapper ({data|templates|workflows: [...]}); keeps only rows
    with a usable id and name."""
    rows = data
    if isinstance(data, dict):
        for key in ("data", "templates", "workflows", "items"):
            if isinstance(data.get(key), list):
                rows = data[key]
                break
    if not isinstance(rows, list):
        return []
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        row_id = row.get("id")
        name = row.get("name")
        if not (row_id and isinstance(name, str) and name.strip()):
            continue
        out.append(
            {
                "id": str(row_id),
                "name": name,
                "thumbnail": row.get("thumbnail") if isinstance(row.get("thumbnail"), str) else None,
                "category": row.get("category") if isinstance(row.get("category"), str) else "Other",
            }
        )
    return out


def _require_http_url(value, field):
    """Returns a JSONResponse on failure, None when valid."""
    if not (value and str(value).strip()):
        return _validation_err(f"{field} is required")
    if not str(value).strip().startswith(("http://", "https://")):
        return _validation_err(f"{field} must be an http(s) URL")
    return None


class GenerateBody(BaseModel):
    category: str
    model: str
    prompt: str
    params: Optional[dict] = None


class EditBody(BaseModel):
    model: str
    prompt: str
    image_url: str
    params: Optional[dict] = None


class AnimateBody(BaseModel):
    model: str
    prompt: str
    image_url: str
    params: Optional[dict] = None


class EffectBody(BaseModel):
    mode: str
    effect: str
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    params: Optional[dict] = None


class EnhanceBody(BaseModel):
    operation: str
    image_url: Optional[str] = None
    source_url: Optional[str] = None
    target_url: Optional[str] = None
    params: Optional[dict] = None


class MarketingBody(BaseModel):
    image_url: str
    motion: str
    prompt: str
    strength: Optional[float] = None
    options: Optional[str] = None


class LipsyncBody(BaseModel):
    model: str
    audio_url: str
    video_url: Optional[str] = None
    image_url: Optional[str] = None
    prompt: Optional[str] = None
    resolution: Optional[str] = None
    seed: Optional[int] = None


class WorkflowExecuteBody(BaseModel):
    inputs: dict


def register_studio_routes(
    app,
    client: Optional[MuapiClient] = None,
    http_client: Optional[MuapiHttpClient] = None,
) -> MuapiClient:
    studio = client or MuapiClient()
    http = http_client or MuapiHttpClient()

    @app.get("/api/studio/status")
    async def studio_status():
        return {"available": studio.is_available(), "has_key": studio.has_key()}

    @app.get("/api/studio/models", response_model=None)
    async def studio_models(category: Optional[str] = None):
        try:
            return {"models": studio.list_models(category)}
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/studio/generate", response_model=None)
    async def studio_generate(body: GenerateBody):
        try:
            return studio.submit(body.category, body.model, body.prompt, body.params)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/studio/jobs/{request_id}", response_model=None)
    async def studio_job(request_id: str):
        try:
            return studio.result(request_id)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/studio/edit", response_model=None)
    async def studio_edit(body: EditBody):
        try:
            return studio.submit_image_edit(body.model, body.prompt, body.image_url, body.params)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/studio/animate", response_model=None)
    async def studio_animate(body: AnimateBody):
        try:
            return studio.submit_video_from_image(body.model, body.prompt, body.image_url, body.params)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/studio/effect", response_model=None)
    async def studio_effect(body: EffectBody):
        try:
            if body.mode == "ai":
                return studio.submit_ai_video_effect(body.effect, body.image_url)
            return studio.submit_effect(
                body.mode, body.effect,
                image_url=body.image_url, video_url=body.video_url, params=body.params,
            )
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/studio/enhance", response_model=None)
    async def studio_enhance(body: EnhanceBody):
        try:
            if body.operation == "face-swap":
                mode = (body.params or {}).get("mode", "image")
                return studio.submit_face_swap(body.source_url, body.target_url, mode=mode)
            return studio.submit_enhance(body.operation, body.image_url, body.params)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/studio/upload", response_model=None)
    async def studio_upload(file: UploadFile = File(...)):
        name = file.filename or ""
        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_UPLOAD_EXTS:
            return _validation_err(f"unsupported file type: {ext or 'unknown'}")
        fd, tmp_path = tempfile.mkstemp(suffix=ext)
        written = 0
        try:
            with os.fdopen(fd, "wb") as out:
                while True:
                    chunk = await file.read(_UPLOAD_CHUNK)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > MAX_UPLOAD_BYTES:
                        return _validation_err(f"file exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload cap")
                    out.write(chunk)
            return studio.upload(tmp_path)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    @app.post("/api/studio/marketing/submit", response_model=None)
    async def studio_marketing_submit(body: MarketingBody):
        bad = _require_http_url(body.image_url, "image_url")
        if bad is not None:
            return bad
        if not (body.prompt and body.prompt.strip()):
            return _validation_err("prompt is required")
        if body.motion not in HF_DOP_MOTION_SET:
            return _validation_err(f"unknown motion: {body.motion}")
        options = body.options or HF_DOP_DEFAULT_OPTION
        if options not in HF_DOP_OPTIONS:
            return _validation_err(f"unknown options: {options}")
        if body.strength is not None and not (0.0 <= body.strength <= 1.0):
            return _validation_err("strength must be between 0 and 1")
        payload = {
            "prompt": body.prompt.strip(),
            "image_url": body.image_url,
            "motion": body.motion,
            "options": options,
        }
        if body.strength is not None:
            payload["strength"] = body.strength
        try:
            return http.submit_model("hf-dop-image-to-video", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/studio/marketing/result/{request_id}", response_model=None)
    async def studio_marketing_result(request_id: str):
        try:
            return http.prediction_result(request_id)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/studio/lipsync/submit", response_model=None)
    async def studio_lipsync_submit(body: LipsyncBody):
        try:
            payload = build_lipsync_payload(body.model, body.model_dump())
        except ValueError as exc:
            return _validation_err(str(exc))
        try:
            return http.submit_model(body.model, payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/studio/lipsync/result/{request_id}", response_model=None)
    async def studio_lipsync_result(request_id: str):
        try:
            return http.prediction_result(request_id)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/studio/workflows/templates", response_model=None)
    async def studio_workflow_templates():
        try:
            data = http.get("/workflow/get-template-workflows")
            return {"templates": _normalize_templates(data)}
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/studio/workflows/run/{run_id}/outputs", response_model=None)
    async def studio_workflow_run_outputs(run_id: str):
        try:
            return http.workflow_run_result(run_id)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/studio/workflows/{workflow_id}/inputs", response_model=None)
    async def studio_workflow_inputs(workflow_id: str):
        try:
            return http.get(f"/workflow/{workflow_id}/api-inputs")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/studio/workflows/{workflow_id}/execute", response_model=None)
    async def studio_workflow_execute(workflow_id: str, body: WorkflowExecuteBody):
        try:
            return http.execute_workflow(workflow_id, body.inputs)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    return studio
