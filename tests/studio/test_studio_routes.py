import io
import os

from fastapi import FastAPI
from fastapi.testclient import TestClient

from hermes_cli.studio.muapi_client import MuapiError
from hermes_cli.studio.routes import register_studio_routes


class FakeClient:
    def __init__(self, available=True, has_key=True, models=None, submit_result=None, job=None, raise_on=None):
        self._available = available
        self._has_key = has_key
        self._models = models or []
        self._submit_result = submit_result or {"request_id": "req-1"}
        self._job = job or {"status": "completed", "outputs": [{"url": "u"}], "error": None}
        self._raise_on = raise_on or {}
        self.calls = []

    def is_available(self):
        return self._available

    def has_key(self):
        return self._has_key

    def list_models(self, category=None):
        if "models" in self._raise_on:
            raise self._raise_on["models"]
        return self._models

    def submit(self, category, model, prompt, params=None):
        if "submit" in self._raise_on:
            raise self._raise_on["submit"]
        return self._submit_result

    def submit_image_edit(self, model, prompt, image_url, params=None):
        self.calls.append(("edit", model, prompt, image_url, params))
        if "edit" in self._raise_on:
            raise self._raise_on["edit"]
        return self._submit_result

    def submit_video_from_image(self, model, prompt, image_url, params=None):
        self.calls.append(("animate", model, prompt, image_url, params))
        if "animate" in self._raise_on:
            raise self._raise_on["animate"]
        return self._submit_result

    def submit_effect(self, mode, effect, image_url=None, video_url=None, params=None):
        self.calls.append(("effect", mode, effect, image_url, video_url, params))
        if "effect" in self._raise_on:
            raise self._raise_on["effect"]
        return self._submit_result

    def submit_ai_video_effect(self, effect, image_url, prompt=None):
        self.calls.append(("ai_effect", effect, image_url))
        if "ai_effect" in self._raise_on:
            raise self._raise_on["ai_effect"]
        return self._submit_result

    def submit_enhance(self, operation, image_url, params=None):
        self.calls.append(("enhance", operation, image_url, params))
        if "enhance" in self._raise_on:
            raise self._raise_on["enhance"]
        return self._submit_result

    def submit_face_swap(self, source_url, target_url, mode="image"):
        self.calls.append(("face_swap", source_url, target_url, mode))
        if "face_swap" in self._raise_on:
            raise self._raise_on["face_swap"]
        return self._submit_result

    def upload(self, file_path):
        self.calls.append(("upload", file_path))
        if "upload" in self._raise_on:
            raise self._raise_on["upload"]
        return {"url": "https://cdn/up/x.png"}

    def result(self, request_id):
        if "result" in self._raise_on:
            raise self._raise_on["result"]
        return self._job


def _app(client):
    app = FastAPI()
    register_studio_routes(app, client=client)
    return TestClient(app)


def test_status_returns_booleans():
    c = _app(FakeClient(available=True, has_key=False))
    r = c.get("/api/studio/status")
    assert r.status_code == 200
    assert r.json() == {"available": True, "has_key": False}


def test_models_passthrough():
    models = [{"name": "veo3", "category": "video:text-to-video", "endpoint": "veo3-text-to-video"}]
    c = _app(FakeClient(models=models))
    r = c.get("/api/studio/models", params={"category": "video"})
    assert r.status_code == 200
    assert r.json() == {"models": models}


def test_generate_returns_request_id():
    c = _app(FakeClient(submit_result={"request_id": "abc"}))
    r = c.post("/api/studio/generate", json={"category": "video", "model": "veo3", "prompt": "a dog"})
    assert r.status_code == 200
    assert r.json() == {"request_id": "abc"}


def test_generate_maps_error_code_to_http():
    c = _app(FakeClient(raise_on={"submit": MuapiError("auth", "no key")}))
    r = c.post("/api/studio/generate", json={"category": "image", "model": "flux-dev", "prompt": "x"})
    assert r.status_code == 401
    assert r.json() == {"error_code": "auth", "message": "no key"}


def test_models_unavailable_maps_to_503():
    c = _app(FakeClient(raise_on={"models": MuapiError("unavailable", "muapi-cli not installed")}))
    r = c.get("/api/studio/models")
    assert r.status_code == 503
    assert r.json()["error_code"] == "unavailable"


def test_job_returns_status_payload():
    job = {"status": "running", "outputs": [], "error": None}
    c = _app(FakeClient(job=job))
    r = c.get("/api/studio/jobs/req-1")
    assert r.status_code == 200
    assert r.json() == job


def test_generate_validation_maps_to_400():
    c = _app(FakeClient(raise_on={"submit": MuapiError("validation", "unsupported category: audio")}))
    r = c.post("/api/studio/generate", json={"category": "audio", "model": "m", "prompt": "x"})
    assert r.status_code == 400
    assert r.json()["error_code"] == "validation"


def test_unknown_error_code_falls_back_to_502():
    c = _app(FakeClient(raise_on={"models": MuapiError("teapot", "weird")}))
    r = c.get("/api/studio/models")
    assert r.status_code == 502
    assert r.json()["error_code"] == "teapot"


def test_job_error_maps_to_http():
    c = _app(FakeClient(raise_on={"result": MuapiError("not_found", "no such job")}))
    r = c.get("/api/studio/jobs/req-x")
    assert r.status_code == 404
    assert r.json()["error_code"] == "not_found"


def test_models_no_category_happy_path():
    models = [{"name": "flux-dev", "category": "image:text-to-image", "endpoint": "flux-dev"}]
    c = _app(FakeClient(models=models))
    r = c.get("/api/studio/models")
    assert r.status_code == 200
    assert r.json() == {"models": models}


def test_internal_error_does_not_leak_detail():
    c = _app(FakeClient(raise_on={"submit": RuntimeError("boom with secret-ish detail")}))
    r = c.post("/api/studio/generate", json={"category": "image", "model": "m", "prompt": "x"})
    assert r.status_code == 500
    assert r.json() == {"error_code": "internal", "message": "internal error"}
    assert "boom" not in r.text


def test_edit_route_returns_request_id():
    fc = FakeClient(submit_result={"request_id": "e1"})
    c = _app(fc)
    r = c.post("/api/studio/edit", json={
        "model": "flux-kontext-dev", "prompt": "blue", "image_url": "https://x/a.png",
    })
    assert r.status_code == 200
    assert r.json() == {"request_id": "e1"}
    assert fc.calls[0] == ("edit", "flux-kontext-dev", "blue", "https://x/a.png", None)


def test_animate_route_returns_request_id():
    fc = FakeClient(submit_result={"request_id": "v1"})
    c = _app(fc)
    r = c.post("/api/studio/animate", json={
        "model": "kling-std", "prompt": "pan", "image_url": "https://x/a.png",
        "params": {"duration": 8},
    })
    assert r.status_code == 200
    assert r.json() == {"request_id": "v1"}
    assert fc.calls[0] == ("animate", "kling-std", "pan", "https://x/a.png", {"duration": 8})


def test_effect_route_returns_request_id():
    fc = FakeClient(submit_result={"request_id": "fx1"})
    c = _app(fc)
    r = c.post("/api/studio/effect", json={
        "mode": "video", "effect": "explode", "video_url": "https://x/v.mp4",
    })
    assert r.status_code == 200
    assert r.json() == {"request_id": "fx1"}
    assert fc.calls[0] == ("effect", "video", "explode", None, "https://x/v.mp4", None)


def test_effect_route_dispatches_ai_mode_to_submit_ai_video_effect():
    fc = FakeClient(submit_result={"request_id": "ai1"})
    c = _app(fc)
    r = c.post("/api/studio/effect", json={
        "mode": "ai", "effect": "Cakeify", "image_url": "https://example.com/in.jpg",
    })
    assert r.status_code == 200
    assert r.json() == {"request_id": "ai1"}
    assert fc.calls == [("ai_effect", "Cakeify", "https://example.com/in.jpg")]


def test_effect_route_rejects_wan_mode():
    fc = FakeClient(raise_on={"effect": MuapiError("validation", "unsupported effect mode: wan")})
    c = _app(fc)
    r = c.post("/api/studio/effect", json={
        "mode": "wan", "effect": "muscle", "image_url": "https://x/a.png",
    })
    assert r.status_code == 400
    assert r.json()["error_code"] == "validation"


def test_enhance_route_positional_op():
    fc = FakeClient(submit_result={"request_id": "u1"})
    c = _app(fc)
    r = c.post("/api/studio/enhance", json={
        "operation": "upscale", "image_url": "https://x/a.png",
    })
    assert r.status_code == 200
    assert r.json() == {"request_id": "u1"}
    assert fc.calls[0] == ("enhance", "upscale", "https://x/a.png", None)


def test_enhance_route_dispatches_face_swap():
    fc = FakeClient(submit_result={"request_id": "fs1"})
    c = _app(fc)
    r = c.post("/api/studio/enhance", json={
        "operation": "face-swap",
        "source_url": "https://x/s.png",
        "target_url": "https://x/t.png",
        "params": {"mode": "video"},
    })
    assert r.status_code == 200
    assert r.json() == {"request_id": "fs1"}
    assert fc.calls[0] == ("face_swap", "https://x/s.png", "https://x/t.png", "video")


def test_edit_route_maps_error_code():
    c = _app(FakeClient(raise_on={"edit": MuapiError("billing", "no credits")}))
    r = c.post("/api/studio/edit", json={"model": "m", "prompt": "p", "image_url": "u"})
    assert r.status_code == 402
    assert r.json()["error_code"] == "billing"


def test_effect_route_maps_validation():
    c = _app(FakeClient(raise_on={"effect": MuapiError("validation", "bad mode")}))
    r = c.post("/api/studio/effect", json={"mode": "audio", "effect": "x"})
    assert r.status_code == 400


def test_new_routes_internal_error_is_clean():
    c = _app(FakeClient(raise_on={"enhance": RuntimeError("boom")}))
    r = c.post("/api/studio/enhance", json={"operation": "upscale", "image_url": "u"})
    assert r.status_code == 500
    assert r.json() == {"error_code": "internal", "message": "internal error"}
    assert "boom" not in r.text


def test_upload_route_streams_and_returns_url():
    fc = FakeClient()
    c = _app(fc)
    r = c.post(
        "/api/studio/upload",
        files={"file": ("photo.png", io.BytesIO(b"\x89PNG\r\n\x1a\nbytes"), "image/png")},
    )
    assert r.status_code == 200
    assert r.json() == {"url": "https://cdn/up/x.png"}
    # client.upload was called with a path that no longer exists (temp deleted)
    assert fc.calls and fc.calls[0][0] == "upload"
    assert not os.path.exists(fc.calls[0][1])


def test_upload_route_rejects_bad_extension():
    c = _app(FakeClient())
    r = c.post(
        "/api/studio/upload",
        files={"file": ("evil.exe", io.BytesIO(b"MZ"), "application/octet-stream")},
    )
    assert r.status_code == 400
    assert r.json()["error_code"] == "validation"


def test_upload_route_rejects_oversize(monkeypatch):
    from hermes_cli.studio import routes as routes_mod
    monkeypatch.setattr(routes_mod, "MAX_UPLOAD_BYTES", 8)
    c = _app(FakeClient())
    big = io.BytesIO(b"0123456789")  # 10 bytes > 8 cap
    r = c.post(
        "/api/studio/upload",
        files={"file": ("big.png", big, "image/png")},
    )
    assert r.status_code == 400
    assert r.json()["error_code"] == "validation"


def test_upload_route_deletes_temp_on_client_error(monkeypatch):
    fc = FakeClient(raise_on={"upload": MuapiError("billing", "no credits")})

    import os as _os
    removed = []
    orig = _os.remove

    def spy_remove(p):
        removed.append(p)
        return orig(p)

    monkeypatch.setattr(_os, "remove", spy_remove)
    c = _app(fc)
    r = c.post(
        "/api/studio/upload",
        files={"file": ("a.png", io.BytesIO(b"x"), "image/png")},
    )
    assert r.status_code == 402
    # temp file was still removed despite the error
    assert removed, "temp file should be deleted in finally"
    assert fc.calls[0][1] in removed


def test_enhance_route_face_swap_missing_urls_is_validation_error():
    c = _app(FakeClient(raise_on={"face_swap": MuapiError("validation", "source and target urls required")}))
    r = c.post("/api/studio/enhance", json={"operation": "face-swap"})
    assert r.status_code == 400
    assert r.json()["error_code"] == "validation"
