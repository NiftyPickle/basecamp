import json

import httpx
import pytest

from hermes_cli.studio.muapi_client import MuapiError
from hermes_cli.studio.muapi_http import MuapiHttpClient

FAKE_KEY = "test-key-not-real"


def make_client(handler, key=FAKE_KEY, timeout=5.0):
    transport = httpx.MockTransport(handler)
    return MuapiHttpClient(
        api_key_provider=lambda: key, timeout=timeout, transport=transport
    )


def test_missing_key_raises_auth_without_network():
    def handler(request):  # pragma: no cover - must never be reached
        raise AssertionError("network should not be hit without a key")

    client = make_client(handler, key="")
    with pytest.raises(MuapiError) as exc:
        client.submit_model("hf-dop-image-to-video", {"prompt": "x"})
    assert exc.value.code == "auth"


def test_submit_model_posts_payload_and_returns_request_id():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["key"] = request.headers.get("x-api-key")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"request_id": "req-9"})

    client = make_client(handler)
    out = client.submit_model("hf-dop-image-to-video", {"prompt": "p", "image_url": "https://x/i.png"})
    assert out == {"request_id": "req-9"}
    assert seen["url"] == "https://api.muapi.ai/api/v1/hf-dop-image-to-video"
    assert seen["key"] == FAKE_KEY
    assert seen["body"] == {"prompt": "p", "image_url": "https://x/i.png"}


def test_submit_model_without_request_id_raises_unknown():
    client = make_client(lambda req: httpx.Response(200, json={"ok": True}))
    with pytest.raises(MuapiError) as exc:
        client.submit_model("hf-dop-image-to-video", {})
    assert exc.value.code == "unknown"


@pytest.mark.parametrize(
    "status,code",
    [(400, "validation"), (401, "auth"), (402, "billing"), (403, "auth"),
     (404, "not_found"), (422, "validation"), (429, "rate_limited"), (500, "unknown")],
)
def test_http_status_maps_to_error_code(status, code):
    client = make_client(lambda req: httpx.Response(status, json={"detail": "boom"}))
    with pytest.raises(MuapiError) as exc:
        client.submit_model("hf-dop-image-to-video", {})
    assert exc.value.code == code
    assert "boom" in exc.value.message


def test_error_body_is_scrubbed_of_key():
    client = make_client(
        lambda req: httpx.Response(401, json={"detail": f"bad key {FAKE_KEY} rejected"})
    )
    with pytest.raises(MuapiError) as exc:
        client.submit_model("hf-dop-image-to-video", {})
    assert FAKE_KEY not in exc.value.message
    assert "***" in exc.value.message


def test_timeout_maps_to_timeout_code():
    def handler(request):
        raise httpx.ConnectTimeout("slow")

    client = make_client(handler)
    with pytest.raises(MuapiError) as exc:
        client.submit_model("hf-dop-image-to-video", {})
    assert exc.value.code == "timeout"


def test_transport_error_maps_to_unavailable():
    def handler(request):
        raise httpx.ConnectError("refused")

    client = make_client(handler)
    with pytest.raises(MuapiError) as exc:
        client.submit_model("hf-dop-image-to-video", {})
    assert exc.value.code == "unavailable"


def test_invalid_json_maps_to_unknown():
    client = make_client(lambda req: httpx.Response(200, content=b"<html>"))
    with pytest.raises(MuapiError) as exc:
        client.submit_model("hf-dop-image-to-video", {})
    assert exc.value.code == "unknown"


def test_submit_model_accepts_dotted_slug():
    captured = {}

    def handler(req):
        captured["url"] = str(req.url)
        return httpx.Response(200, json={"request_id": "req-dot"})

    client = make_client(handler)
    out = client.submit_model("ltx-2.3-lipsync", {"audio_url": "https://x/a.mp3"})
    assert out["request_id"] == "req-dot"
    assert "ltx-2.3-lipsync" in captured["url"]


def test_submit_model_rejects_bad_slug():
    client = make_client(lambda req: httpx.Response(200, json={"request_id": "r"}))
    for bad in ("", "a/b", "../x", "a?b", "Upper"):
        with pytest.raises(MuapiError) as exc:
            client.submit_model(bad, {})
        assert exc.value.code == "validation"


def test_prediction_result_normalizes_status():
    def handler(request):
        assert str(request.url) == "https://api.muapi.ai/api/v1/predictions/req-1/result"
        return httpx.Response(
            200, json={"status": "succeeded", "outputs": [{"url": "https://x/v.mp4"}]}
        )

    client = make_client(handler)
    out = client.prediction_result("req-1")
    assert out == {
        "status": "completed",
        "outputs": [{"url": "https://x/v.mp4"}],
        "error": None,
    }


def test_prediction_result_requires_id():
    client = make_client(lambda req: httpx.Response(200, json={}))
    with pytest.raises(MuapiError) as exc:
        client.prediction_result("")
    assert exc.value.code == "validation"


def test_prediction_result_coerces_non_list_outputs():
    client = make_client(
        lambda req: httpx.Response(200, json={"status": "processing", "outputs": "nope"})
    )
    out = client.prediction_result("req-2")
    assert out["outputs"] == []
    # normalize_status maps "processing" to "running" (see _STATUS_MAP in muapi_client.py)
    assert out["status"] == "running"


def test_execute_workflow_normalizes_run_id():
    def handler(request):
        assert str(request.url) == "https://api.muapi.ai/workflow/wf-1/api-execute"
        assert json.loads(request.content) == {"size": "2"}
        return httpx.Response(200, json={"run_id": "run-7"})

    client = make_client(handler)
    assert client.execute_workflow("wf-1", {"size": "2"}) == {"request_id": "run-7"}


def test_execute_workflow_accepts_id_key_fallback():
    client = make_client(lambda req: httpx.Response(200, json={"id": "run-8"}))
    assert client.execute_workflow("wf-1", {}) == {"request_id": "run-8"}


def test_execute_workflow_without_run_id_raises_unknown():
    client = make_client(lambda req: httpx.Response(200, json={"ok": True}))
    with pytest.raises(MuapiError) as exc:
        client.execute_workflow("wf-1", {})
    assert exc.value.code == "unknown"


def test_workflow_run_result_normalizes_to_job_shape():
    def handler(request):
        assert str(request.url) == "https://api.muapi.ai/workflow/run/run-7/api-outputs"
        return httpx.Response(
            200, json={"status": "processing", "outputs": None}
        )

    client = make_client(handler)
    assert client.workflow_run_result("run-7") == {
        "status": "running",
        "outputs": [],
        "error": None,
    }


def test_workflow_run_result_requires_id():
    client = make_client(lambda req: httpx.Response(200, json={}))
    with pytest.raises(MuapiError) as exc:
        client.workflow_run_result(" ")
    assert exc.value.code == "validation"
