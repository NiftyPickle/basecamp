import json

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hermes_cli.studio.muapi_http import MuapiHttpClient
from hermes_cli.vibe.routes import register_vibe_routes

FAKE_KEY = "test-key-not-real"


def _app(handler, key=FAKE_KEY):
    """Build a tiny FastAPI app wired to a mocked MuapiHttpClient transport."""
    transport = httpx.MockTransport(handler)
    http_client = MuapiHttpClient(
        api_key_provider=lambda: key, timeout=5.0, transport=transport
    )
    app = FastAPI()
    register_vibe_routes(app, http_client=http_client)
    return TestClient(app)


def test_get_workflow_defs_forwards_and_passes_through():
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["path"] = request.url.path
        return httpx.Response(200, json={"defs": [{"id": "w1"}]})

    c = _app(handler)
    r = c.get("/api/workflow/get-workflow-defs")
    assert r.status_code == 200
    assert r.json() == {"defs": [{"id": "w1"}]}
    assert seen["method"] == "GET"
    assert seen["path"] == "/workflow/get-workflow-defs"


def test_create_forwards_json_body():
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"id": "new-wf"})

    c = _app(handler)
    r = c.post("/api/workflow/create", json={"name": "My Flow", "nodes": []})
    assert r.status_code == 200
    assert r.json() == {"id": "new-wf"}
    assert seen["method"] == "POST"
    assert seen["path"] == "/workflow/create"
    assert seen["body"] == {"name": "My Flow", "nodes": []}


def test_path_param_run_status_forwards():
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["path"] = request.url.path
        return httpx.Response(200, json={"status": "running"})

    c = _app(handler)
    r = c.get("/api/workflow/run/abc123/status")
    assert r.status_code == 200
    assert r.json() == {"status": "running"}
    assert seen["method"] == "GET"
    assert seen["path"] == "/workflow/run/abc123/status"


def test_delete_node_run_forwards_delete():
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["path"] = request.url.path
        return httpx.Response(200, json={"deleted": True})

    c = _app(handler)
    r = c.delete("/api/workflow/node-run/n1")
    assert r.status_code == 200
    assert r.json() == {"deleted": True}
    assert seen["method"] == "DELETE"
    assert seen["path"] == "/workflow/node-run/n1"


def test_app_file_upload_url_forwards_querystring():
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["path"] = request.url.path
        seen["query"] = dict(request.url.params)
        return httpx.Response(200, json={"upload_url": "https://cdn/u"})

    c = _app(handler)
    r = c.get(
        "/api/app/get_file_upload_url",
        params={"file_name": "x.png", "content_type": "image/png"},
    )
    assert r.status_code == 200
    assert r.json() == {"upload_url": "https://cdn/u"}
    assert seen["method"] == "GET"
    assert seen["path"] == "/app/get_file_upload_url"
    assert seen["query"] == {"file_name": "x.png", "content_type": "image/png"}


def test_404_maps_to_studio_error_envelope():
    c = _app(lambda req: httpx.Response(404, json={"detail": "nope"}))
    r = c.get("/api/workflow/get-workflow-def/missing")
    assert r.status_code == 404
    body = r.json()
    assert body["error_code"] == "not_found"
    assert "message" in body


def test_error_body_never_contains_api_key():
    c = _app(
        lambda req: httpx.Response(401, json={"detail": f"bad key {FAKE_KEY} rejected"})
    )
    r = c.get("/api/workflow/get-workflow-defs")
    assert r.status_code == 401
    assert FAKE_KEY not in r.text
