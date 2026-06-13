"""FastAPI routes for the Vibe-Workflow MUAPI proxy.

Transparent passthrough handlers for the node-based workflow builder. They
forward verbatim to ``https://api.muapi.ai/workflow/*`` and ``/app/*`` via the
shared ``MuapiHttpClient`` (which sends the key only as ``x-api-key`` and scrubs
it from every error). Unlike the studio proxy, these handlers do NOT normalize
the job/response shape -- the Vibe frontend consumes the raw MuAPI JSON.

Routes attach via ``register_vibe_routes(app)`` and inherit the dashboard's
existing ``/api/`` auth gate. The MUAPI key never appears in any response.
"""

from __future__ import annotations

from urllib.parse import urlencode
from typing import Optional

from fastapi import Request

from hermes_cli.studio.muapi_client import MuapiError
from hermes_cli.studio.muapi_http import MuapiHttpClient
from hermes_cli.studio.routes import _err, _internal_err


def register_vibe_routes(
    app,
    http_client: Optional[MuapiHttpClient] = None,
) -> MuapiHttpClient:
    http = http_client or MuapiHttpClient()

    # -- WORKFLOW: static-prefix routes first (avoid {workflow_id} swallowing
    # literals like "create"/"run"/"architect"). ------------------------------

    @app.post("/api/workflow/create", response_model=None)
    async def vibe_create(request: Request):
        try:
            payload = await request.json()
            return http.post("/workflow/create", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/workflow/get-workflow-defs", response_model=None)
    async def vibe_get_workflow_defs():
        try:
            return http.get("/workflow/get-workflow-defs")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/workflow/get-workflow-def/{workflow_id}", response_model=None)
    async def vibe_get_workflow_def(workflow_id: str):
        try:
            return http.get(f"/workflow/get-workflow-def/{workflow_id}")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.delete("/api/workflow/delete-workflow-def/{workflow_id}", response_model=None)
    async def vibe_delete_workflow_def(workflow_id: str):
        try:
            return http.delete(f"/workflow/delete-workflow-def/{workflow_id}")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/workflow/update-name/{workflow_id}", response_model=None)
    async def vibe_update_name(workflow_id: str, request: Request):
        try:
            payload = await request.json()
            return http.post(f"/workflow/update-name/{workflow_id}", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/workflow/run/{run_id}/status", response_model=None)
    async def vibe_run_status(run_id: str):
        try:
            return http.get(f"/workflow/run/{run_id}/status")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/workflow/run/{run_id}/api-outputs", response_model=None)
    async def vibe_run_api_outputs(run_id: str):
        try:
            return http.get(f"/workflow/run/{run_id}/api-outputs")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/workflow/workflow/{workflow_id}/publish", response_model=None)
    async def vibe_publish(workflow_id: str, request: Request):
        try:
            payload = await request.json()
            return http.post(f"/workflow/workflow/{workflow_id}/publish", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/workflow/workflow/{workflow_id}/template", response_model=None)
    async def vibe_template(workflow_id: str, request: Request):
        try:
            payload = await request.json()
            return http.post(f"/workflow/workflow/{workflow_id}/template", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/workflow/cloudfront-signed-url", response_model=None)
    async def vibe_cloudfront_signed_url(request: Request):
        try:
            payload = await request.json()
            return http.post("/workflow/cloudfront-signed-url", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/workflow/get-workflow-last-run/{workflow_id}", response_model=None)
    async def vibe_get_last_run(workflow_id: str):
        try:
            return http.get(f"/workflow/get-workflow-last-run/{workflow_id}")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/workflow/architect", response_model=None)
    async def vibe_architect(request: Request):
        try:
            payload = await request.json()
            return http.post("/workflow/architect", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/workflow/poll-architect/{id}/result", response_model=None)
    async def vibe_poll_architect(id: str):
        try:
            return http.get(f"/workflow/poll-architect/{id}/result")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.delete("/api/workflow/node-run/{node_run_id}", response_model=None)
    async def vibe_delete_node_run(node_run_id: str):
        try:
            return http.delete(f"/workflow/node-run/{node_run_id}")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/workflow/update-category/{workflow_id}", response_model=None)
    async def vibe_update_category(workflow_id: str, request: Request):
        try:
            payload = await request.json()
            return http.post(f"/workflow/update-category/{workflow_id}", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    # -- WORKFLOW: generic two-segment {workflow_id}/... routes. ---------------

    @app.get("/api/workflow/{workflow_id}/node-schemas", response_model=None)
    async def vibe_node_schemas(workflow_id: str):
        try:
            return http.get(f"/workflow/{workflow_id}/node-schemas")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/workflow/{workflow_id}/api-node-schemas", response_model=None)
    async def vibe_api_node_schemas(workflow_id: str):
        try:
            return http.get(f"/workflow/{workflow_id}/api-node-schemas")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/workflow/{workflow_id}/run", response_model=None)
    async def vibe_run(workflow_id: str, request: Request):
        try:
            payload = await request.json()
            return http.post(f"/workflow/{workflow_id}/run", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/workflow/{workflow_id}/node/{node_id}/run", response_model=None)
    async def vibe_node_run(workflow_id: str, node_id: str, request: Request):
        try:
            payload = await request.json()
            return http.post(f"/workflow/{workflow_id}/node/{node_id}/run", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/workflow/{workflow_id}/thumbnail", response_model=None)
    async def vibe_thumbnail(workflow_id: str, request: Request):
        try:
            payload = await request.json()
            return http.post(f"/workflow/{workflow_id}/thumbnail", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.get("/api/workflow/{workflow_id}/api-inputs", response_model=None)
    async def vibe_api_inputs(workflow_id: str):
        try:
            return http.get(f"/workflow/{workflow_id}/api-inputs")
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/workflow/{workflow_id}/api-execute", response_model=None)
    async def vibe_api_execute(workflow_id: str, request: Request):
        try:
            payload = await request.json()
            return http.post(f"/workflow/{workflow_id}/api-execute", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    # -- APP routes. ----------------------------------------------------------

    @app.get("/api/app/get_file_upload_url", response_model=None)
    async def vibe_get_file_upload_url(request: Request):
        try:
            qs = urlencode(dict(request.query_params))
            path = "/app/get_file_upload_url"
            if qs:
                path = f"{path}?{qs}"
            return http.get(path)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    @app.post("/api/app/calculate_dynamic_cost", response_model=None)
    async def vibe_calculate_dynamic_cost(request: Request):
        try:
            payload = await request.json()
            return http.post("/app/calculate_dynamic_cost", payload)
        except MuapiError as exc:
            return _err(exc)
        except Exception:
            return _internal_err()

    return http
