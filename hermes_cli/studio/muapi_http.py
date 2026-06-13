"""Direct HTTPS client for MUAPI endpoints the muapi-cli does not cover
(hf-dop, lipsync models, workflow API).

Mirrors MuapiClient's contract exactly: raises MuapiError with the same
codes (auth, rate_limited, not_found, billing, timeout, validation,
unavailable, unknown), normalizes job status with the same vocabulary, and
scrubs the API key out of every error message. The key is sent only as the
x-api-key request header and never appears in logs, errors, or returns.
"""

from __future__ import annotations

import re
from typing import Callable, Optional

import httpx

from hermes_cli.studio.muapi_client import (
    MuapiError,
    _default_api_key,
    _scrub,
    normalize_status,
)

MUAPI_BASE = "https://api.muapi.ai"

_STATUS_TO_CODE = {
    400: "validation",
    401: "auth",
    402: "billing",
    403: "auth",
    404: "not_found",
    422: "validation",
    429: "rate_limited",
}

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9.-]*$")


def _detail(res: httpx.Response) -> str:
    try:
        data = res.json()
    except ValueError:
        return res.text or f"HTTP {res.status_code}"
    if isinstance(data, dict):
        for key in ("detail", "message", "error"):
            v = data.get(key)
            if isinstance(v, str) and v.strip():
                return v
    return res.text or f"HTTP {res.status_code}"


class MuapiHttpClient:
    def __init__(
        self,
        api_key_provider: Optional[Callable[[], str]] = None,
        timeout: float = 60.0,
        transport: Optional[httpx.BaseTransport] = None,
    ):
        self._api_key_provider = api_key_provider or _default_api_key
        self._timeout = timeout
        self._transport = transport  # injected in tests (httpx.MockTransport)

    def has_key(self) -> bool:
        return bool(self._api_key_provider())

    def _request(self, method: str, path: str, json_body=None):
        key = self._api_key_provider()
        if not key:
            raise MuapiError("auth", "MUAPI_API_KEY is not set")
        headers = {"x-api-key": key, "accept": "application/json"}
        try:
            with httpx.Client(
                base_url=MUAPI_BASE, timeout=self._timeout, transport=self._transport
            ) as client:
                res = client.request(method, path, json=json_body, headers=headers)
        except httpx.TimeoutException as exc:
            raise MuapiError("timeout", "muapi request timed out") from exc
        except httpx.HTTPError as exc:
            raise MuapiError("unavailable", _scrub(str(exc), key)) from exc
        if res.status_code >= 400:
            code = _STATUS_TO_CODE.get(res.status_code, "unknown")
            raise MuapiError(code, _scrub(_detail(res), key))
        try:
            return res.json()
        except ValueError as exc:
            raise MuapiError("unknown", "invalid JSON from muapi") from exc

    def get(self, path: str):
        return self._request("GET", path)

    def post(self, path: str, payload=None):
        return self._request("POST", path, json_body=payload or {})

    def delete(self, path: str):
        return self._request("DELETE", path)

    def submit_model(self, slug: str, payload: dict) -> dict:
        """POST /api/v1/<slug>; return {'request_id': str}."""
        if not (isinstance(slug, str) and _SLUG_RE.fullmatch(slug)):
            raise MuapiError("validation", "invalid model slug")
        data = self.post(f"/api/v1/{slug}", payload)
        request_id = data.get("request_id") if isinstance(data, dict) else None
        if request_id is None or (isinstance(request_id, str) and not request_id.strip()):
            raise MuapiError("unknown", "muapi did not return a request_id")
        return {"request_id": str(request_id)}

    def prediction_result(self, request_id: str) -> dict:
        """GET /api/v1/predictions/<id>/result, normalized to the shared
        {status, outputs, error} job shape."""
        if not (request_id and str(request_id).strip()):
            raise MuapiError("validation", "request_id is required")
        data = self.get(f"/api/v1/predictions/{request_id}/result")
        if not isinstance(data, dict):
            data = {}
        raw_outputs = data.get("outputs")
        outputs = raw_outputs if isinstance(raw_outputs, list) else []
        error = data.get("error")
        status = normalize_status(data.get("status"), outputs, error)
        return {"status": status, "outputs": outputs, "error": error}

    def execute_workflow(self, workflow_id: str, inputs: dict) -> dict:
        """POST /workflow/<id>/api-execute; normalize the run id to the
        shared {'request_id': str} submit shape."""
        if not (workflow_id and str(workflow_id).strip()):
            raise MuapiError("validation", "workflow_id is required")
        data = self.post(f"/workflow/{workflow_id}/api-execute", inputs)
        run_id = None
        if isinstance(data, dict):
            run_id = data.get("run_id") or data.get("id")
        if run_id is None or not str(run_id).strip():
            raise MuapiError("unknown", "muapi did not return a run id")
        return {"request_id": str(run_id)}

    def workflow_run_result(self, run_id: str) -> dict:
        """GET /workflow/run/<id>/api-outputs, normalized to the shared
        {status, outputs, error} job shape."""
        if not (run_id and str(run_id).strip()):
            raise MuapiError("validation", "run_id is required")
        data = self.get(f"/workflow/run/{run_id}/api-outputs")
        if not isinstance(data, dict):
            data = {}
        raw_outputs = data.get("outputs")
        outputs = raw_outputs if isinstance(raw_outputs, list) else []
        error = data.get("error")
        status = normalize_status(data.get("status"), outputs, error)
        return {"status": status, "outputs": outputs, "error": error}
