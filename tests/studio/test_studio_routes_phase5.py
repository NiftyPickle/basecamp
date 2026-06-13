"""Route tests for phase 5 (marketing, lipsync, workflows). Uses a fake
MuapiHttpClient so no network is touched."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from hermes_cli.studio.muapi_client import MuapiError
from hermes_cli.studio.routes import register_studio_routes
from tests.studio.test_studio_routes import FakeClient


class FakeHttpClient:
    def __init__(self, submit_result=None, job=None, raise_on=None, responses=None):
        self._submit_result = submit_result or {"request_id": "req-1"}
        self._job = job or {"status": "completed", "outputs": [{"url": "u"}], "error": None}
        self._raise_on = raise_on or {}
        self._responses = responses or {}
        self.calls = []

    def has_key(self):
        return True

    def submit_model(self, slug, payload):
        self.calls.append(("submit_model", slug, payload))
        if "submit_model" in self._raise_on:
            raise self._raise_on["submit_model"]
        return self._submit_result

    def prediction_result(self, request_id):
        self.calls.append(("prediction_result", request_id))
        if "prediction_result" in self._raise_on:
            raise self._raise_on["prediction_result"]
        return self._job

    def get(self, path):
        self.calls.append(("get", path))
        if "get" in self._raise_on:
            raise self._raise_on["get"]
        return self._responses.get(path, {})

    def post(self, path, payload=None):
        self.calls.append(("post", path, payload))
        if "post" in self._raise_on:
            raise self._raise_on["post"]
        return self._responses.get(path, {})

    def execute_workflow(self, workflow_id, inputs):
        self.calls.append(("execute_workflow", workflow_id, inputs))
        if "execute_workflow" in self._raise_on:
            raise self._raise_on["execute_workflow"]
        return self._submit_result

    def workflow_run_result(self, run_id):
        self.calls.append(("workflow_run_result", run_id))
        if "workflow_run_result" in self._raise_on:
            raise self._raise_on["workflow_run_result"]
        return self._job


def _app(http=None):
    app = FastAPI()
    register_studio_routes(app, client=FakeClient(), http_client=http or FakeHttpClient())
    return TestClient(app)


def test_marketing_submit_forwards_full_payload():
    http = FakeHttpClient(submit_result={"request_id": "mk-1"})
    c = _app(http)
    r = c.post(
        "/api/studio/marketing/submit",
        json={
            "image_url": "https://x/i.png",
            "motion": "Bullet Time",
            "prompt": "hero shot",
            "strength": 0.8,
            "options": "dop-turbo",
        },
    )
    assert r.status_code == 200
    assert r.json() == {"request_id": "mk-1"}
    assert http.calls == [
        (
            "submit_model",
            "hf-dop-image-to-video",
            {
                "prompt": "hero shot",
                "image_url": "https://x/i.png",
                "motion": "Bullet Time",
                "strength": 0.8,
                "options": "dop-turbo",
            },
        )
    ]


def test_marketing_submit_defaults_omit_optional_fields():
    http = FakeHttpClient()
    c = _app(http)
    r = c.post(
        "/api/studio/marketing/submit",
        json={"image_url": "https://x/i.png", "motion": "Zoom In", "prompt": "p"},
    )
    assert r.status_code == 200
    payload = http.calls[0][2]
    assert "strength" not in payload
    assert payload["options"] == "dop-lite"


def test_marketing_submit_rejects_unknown_motion():
    c = _app()
    r = c.post(
        "/api/studio/marketing/submit",
        json={"image_url": "https://x/i.png", "motion": "Backflip", "prompt": "p"},
    )
    assert r.status_code == 400
    assert r.json()["error_code"] == "validation"


def test_marketing_submit_rejects_unknown_options():
    c = _app()
    r = c.post(
        "/api/studio/marketing/submit",
        json={
            "image_url": "https://x/i.png",
            "motion": "Zoom In",
            "prompt": "p",
            "options": "dop-max",
        },
    )
    assert r.status_code == 400


def test_marketing_submit_rejects_out_of_range_strength():
    c = _app()
    for bad in (-0.1, 1.5):
        r = c.post(
            "/api/studio/marketing/submit",
            json={"image_url": "https://x/i.png", "motion": "Zoom In", "prompt": "p", "strength": bad},
        )
        assert r.status_code == 400
        assert r.json()["error_code"] == "validation"


def test_marketing_submit_requires_http_image_url():
    c = _app()
    r = c.post(
        "/api/studio/marketing/submit",
        json={"image_url": "ftp://x/i.png", "motion": "Zoom In", "prompt": "p"},
    )
    assert r.status_code == 400


def test_marketing_submit_maps_muapi_error():
    http = FakeHttpClient(raise_on={"submit_model": MuapiError("billing", "no credits")})
    c = _app(http)
    r = c.post(
        "/api/studio/marketing/submit",
        json={"image_url": "https://x/i.png", "motion": "Zoom In", "prompt": "p"},
    )
    assert r.status_code == 402
    assert r.json() == {"error_code": "billing", "message": "no credits"}


def test_marketing_result_returns_job():
    http = FakeHttpClient(job={"status": "running", "outputs": [], "error": None})
    c = _app(http)
    r = c.get("/api/studio/marketing/result/req-7")
    assert r.status_code == 200
    assert r.json() == {"status": "running", "outputs": [], "error": None}
    assert ("prediction_result", "req-7") in http.calls


def test_lipsync_submit_video_model():
    http = FakeHttpClient(submit_result={"request_id": "ls-1"})
    c = _app(http)
    r = c.post(
        "/api/studio/lipsync/submit",
        json={
            "model": "latentsync-video",
            "audio_url": "https://x/a.mp3",
            "video_url": "https://x/v.mp4",
        },
    )
    assert r.status_code == 200
    assert r.json() == {"request_id": "ls-1"}
    assert http.calls == [
        (
            "submit_model",
            "latentsync-video",
            {"audio_url": "https://x/a.mp3", "video_url": "https://x/v.mp4"},
        )
    ]


def test_lipsync_submit_ltx_defaults_resolution():
    http = FakeHttpClient()
    c = _app(http)
    r = c.post(
        "/api/studio/lipsync/submit",
        json={"model": "ltx-2-19b-lipsync", "audio_url": "https://x/a.mp3"},
    )
    assert r.status_code == 200
    assert http.calls[0][2] == {"audio_url": "https://x/a.mp3", "resolution": "720p"}


def test_lipsync_submit_contract_violation_is_400():
    c = _app()
    r = c.post(
        "/api/studio/lipsync/submit",
        json={"model": "creatify-lipsync", "audio_url": "https://x/a.mp3"},
    )
    assert r.status_code == 400
    assert "video_url" in r.json()["message"]


def test_lipsync_submit_unknown_model_is_400():
    c = _app()
    r = c.post(
        "/api/studio/lipsync/submit",
        json={"model": "wav2lip", "audio_url": "https://x/a.mp3"},
    )
    assert r.status_code == 400


def test_lipsync_submit_maps_muapi_error():
    http = FakeHttpClient(raise_on={"submit_model": MuapiError("rate_limited", "slow down")})
    c = _app(http)
    r = c.post(
        "/api/studio/lipsync/submit",
        json={
            "model": "latentsync-video",
            "audio_url": "https://x/a.mp3",
            "video_url": "https://x/v.mp4",
        },
    )
    assert r.status_code == 429


def test_lipsync_result_returns_job():
    http = FakeHttpClient(
        job={"status": "completed", "outputs": [{"url": "https://x/out.mp4"}], "error": None}
    )
    c = _app(http)
    r = c.get("/api/studio/lipsync/result/ls-9")
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    assert ("prediction_result", "ls-9") in http.calls


TEMPLATE_FIXTURE = [
    {
        "id": "wf-prod-photo",
        "name": "Product Photography",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
        "thumbnail": "https://cdn.muapi.ai/thumbs/prod-photo.jpg",
        "category": "E-Commerce",
    },
    {
        "id": "wf-room-redesign",
        "name": "Room Redesign",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
        "thumbnail": "https://cdn.muapi.ai/thumbs/room.jpg",
        "category": "Home Decor",
    },
    {"name": "malformed row without id"},
]


def test_workflow_templates_filters_malformed_rows():
    http = FakeHttpClient(
        responses={"/workflow/get-template-workflows": TEMPLATE_FIXTURE}
    )
    c = _app(http)
    r = c.get("/api/studio/workflows/templates")
    assert r.status_code == 200
    templates = r.json()["templates"]
    assert [t["id"] for t in templates] == ["wf-prod-photo", "wf-room-redesign"]
    assert templates[0]["category"] == "E-Commerce"
    assert ("get", "/workflow/get-template-workflows") in http.calls


def test_workflow_templates_handles_wrapped_response():
    http = FakeHttpClient(
        responses={"/workflow/get-template-workflows": {"data": TEMPLATE_FIXTURE[:1]}}
    )
    c = _app(http)
    r = c.get("/api/studio/workflows/templates")
    assert [t["id"] for t in r.json()["templates"]] == ["wf-prod-photo"]


def test_workflow_inputs_passthrough():
    http = FakeHttpClient(
        responses={"/workflow/wf-1/api-inputs": {"inputs": [{"name": "image_url"}]}}
    )
    c = _app(http)
    r = c.get("/api/studio/workflows/wf-1/inputs")
    assert r.status_code == 200
    assert r.json() == {"inputs": [{"name": "image_url"}]}


def test_workflow_execute_forwards_inputs():
    http = FakeHttpClient(submit_result={"request_id": "run-1"})
    c = _app(http)
    r = c.post(
        "/api/studio/workflows/wf-1/execute",
        json={"inputs": {"image_url": "https://x/i.png", "style": "noir"}},
    )
    assert r.status_code == 200
    assert r.json() == {"request_id": "run-1"}
    assert http.calls == [
        ("execute_workflow", "wf-1", {"image_url": "https://x/i.png", "style": "noir"})
    ]


def test_workflow_execute_maps_muapi_error():
    http = FakeHttpClient(raise_on={"execute_workflow": MuapiError("auth", "bad key ***")})
    c = _app(http)
    r = c.post("/api/studio/workflows/wf-1/execute", json={"inputs": {}})
    assert r.status_code == 401


def test_workflow_run_outputs():
    http = FakeHttpClient(
        job={"status": "completed", "outputs": [{"url": "https://x/o.png"}], "error": None}
    )
    c = _app(http)
    r = c.get("/api/studio/workflows/run/run-1/outputs")
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    assert ("workflow_run_result", "run-1") in http.calls
