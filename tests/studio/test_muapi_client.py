import json

import pytest

from hermes_cli.studio.muapi_client import (
    AI_EFFECT_DEFAULT_PROMPT,
    MuapiClient,
    MuapiError,
    RunResult,
    normalize_status,
)


def _client(run=None, binary_path="muapi", key="k-123"):
    return MuapiClient(
        run=run,
        binary_path=binary_path,
        api_key_provider=lambda: key,
    )


def test_is_available_true_when_binary_set():
    assert _client(binary_path="muapi").is_available() is True


def test_is_available_false_when_binary_missing():
    assert _client(binary_path=None).is_available() is False


def test_has_key_true_when_provider_returns_value():
    assert _client(key="k-123").has_key() is True


def test_has_key_false_when_provider_returns_empty():
    assert _client(key="").has_key() is False


def test_normalize_status_known_synonyms():
    assert normalize_status("success") == "completed"
    assert normalize_status("processing") == "running"
    assert normalize_status("queued") == "pending"
    assert normalize_status("error") == "failed"


def test_normalize_status_fallbacks():
    assert normalize_status("weird", outputs=[{"url": "x"}]) == "completed"
    assert normalize_status("weird", error="boom") == "failed"
    assert normalize_status(None) == "pending"


def test_run_result_is_immutable():
    rr = RunResult(exit_code=0, stdout="{}", stderr="")
    with pytest.raises(AttributeError):
        rr.exit_code = 1  # type: ignore[misc]


def test_muapi_error_carries_code_and_message():
    e = MuapiError("auth", "bad key")
    assert e.code == "auth"
    assert e.message == "bad key"
    assert str(e) == "bad key"


def _fake_run(result, captured=None):
    def run(argv, env, timeout):
        if captured is not None:
            captured["argv"] = argv
            captured["env"] = env
        return result
    return run


def test_list_models_video_parses_catalog():
    catalog = [
        {"name": "veo3", "category": "video:text-to-video", "endpoint": "veo3-text-to-video"},
        {"name": "kling-master", "category": "video:text-to-video", "endpoint": "kling-master-text-to-video"},
    ]
    captured = {}
    c = _client(run=_fake_run(RunResult(0, json.dumps(catalog), ""), captured))
    models = c.list_models(category="video")
    assert [m["name"] for m in models] == ["veo3", "kling-master"]
    assert captured["argv"] == ["muapi", "models", "list", "--category", "video", "--output-json"]


def test_list_models_no_category_omits_flag():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, "[]", ""), captured))
    assert c.list_models() == []
    assert captured["argv"] == ["muapi", "models", "list", "--output-json"]


def test_list_models_rejects_unknown_category():
    c = _client(run=_fake_run(RunResult(0, "[]", "")))
    try:
        c.list_models(category="audio")
        raised = None
    except MuapiError as e:
        raised = e
    assert raised is not None and raised.code == "validation"


def test_invoke_maps_exit_codes():
    cases = {3: "auth", 4: "rate_limited", 5: "not_found", 6: "billing", 7: "timeout", 8: "validation", 1: "unknown"}
    for code, expected in cases.items():
        c = _client(run=_fake_run(RunResult(code, "", "bad")))
        try:
            c.list_models()
            got = None
        except MuapiError as e:
            got = e.code
        assert got == expected, f"exit {code} -> {got}, expected {expected}"


def test_invoke_unavailable_when_no_binary():
    c = _client(binary_path=None, run=_fake_run(RunResult(0, "[]", "")))
    try:
        c.list_models()
        got = None
    except MuapiError as e:
        got = e.code
    assert got == "unavailable"


def test_error_never_contains_key():
    c = _client(key="SECRET-KEY", run=_fake_run(RunResult(3, "", "auth failed for SECRET-KEY")))
    try:
        c.list_models()
        msg = ""
    except MuapiError as e:
        msg = e.message
    assert "SECRET-KEY" not in msg
    assert "***" in msg


def test_error_does_not_leak_ambient_env_key(monkeypatch):
    monkeypatch.setenv("MUAPI_API_KEY", "AMBIENT-SECRET")
    c = _client(key="", run=_fake_run(RunResult(3, "", "auth failed for AMBIENT-SECRET")))
    try:
        c.list_models()
        msg = ""
    except MuapiError as e:
        msg = e.message
    assert "AMBIENT-SECRET" not in msg


def test_invoke_injects_key_into_env():
    captured = {}
    c = _client(key="k-xyz", run=_fake_run(RunResult(0, "[]", ""), captured))
    c.list_models()
    assert captured["env"].get("MUAPI_API_KEY") == "k-xyz"


def test_invoke_bad_json_is_unknown():
    c = _client(run=_fake_run(RunResult(0, "not json", "")))
    try:
        c.list_models()
        got = None
    except MuapiError as e:
        got = e.code
    assert got == "unknown"


def test_submit_builds_argv_and_returns_request_id():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "req-1"}', ""), captured))
    out = c.submit("video", "kling-master", "a dog on a beach")
    assert out == {"request_id": "req-1"}
    assert captured["argv"] == [
        "muapi", "video", "generate", "a dog on a beach",
        "--model", "kling-master", "--no-wait", "--output-json",
    ]


def test_submit_maps_whitelisted_params():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "r"}', ""), captured))
    c.submit("image", "flux-dev", "sunset", params={"width": 768, "aspect_ratio": "16:9", "junk": "x"})
    argv = captured["argv"]
    assert argv[argv.index("--width") + 1] == "768"
    assert argv[argv.index("--aspect-ratio") + 1] == "16:9"
    assert "junk" not in argv and "x" not in argv


def test_submit_coerces_request_id_to_str():
    c = _client(run=_fake_run(RunResult(0, '{"request_id": 42}', "")))
    assert c.submit("image", "flux-dev", "hi") == {"request_id": "42"}


def test_submit_validation_runs_before_subprocess():
    calls = {"n": 0}

    def run(argv, env, timeout):
        calls["n"] += 1
        return RunResult(0, "{}", "")

    c = _client(run=run)
    for bad in [("", "m", "p"), ("audio", "m", "p"), ("image", "", "p"), ("image", "m", "  ")]:
        try:
            c.submit(*bad)
            code = None
        except MuapiError as e:
            code = e.code
        assert code == "validation"
    assert calls["n"] == 0


def test_submit_missing_request_id_is_unknown():
    c = _client(run=_fake_run(RunResult(0, "{}", "")))
    try:
        c.submit("image", "flux-dev", "hi")
        got = None
    except MuapiError as e:
        got = e.code
    assert got == "unknown"


def test_submit_accepts_zero_request_id():
    c = _client(run=_fake_run(RunResult(0, '{"request_id": 0}', "")))
    assert c.submit("image", "flux-dev", "hi") == {"request_id": "0"}


def test_submit_blank_request_id_is_unknown():
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "  "}', "")))
    try:
        c.submit("image", "flux-dev", "hi")
        got = None
    except MuapiError as e:
        got = e.code
    assert got == "unknown"


def test_result_completed_with_outputs():
    payload = '{"status": "success", "outputs": [{"url": "https://x/a.png"}]}'
    captured = {}
    c = _client(run=_fake_run(RunResult(0, payload, ""), captured))
    out = c.result("req-1")
    assert out["status"] == "completed"
    assert out["outputs"] == [{"url": "https://x/a.png"}]
    assert out["error"] is None
    assert captured["argv"] == ["muapi", "predict", "result", "req-1", "--output-json"]


def test_result_processing_is_running():
    c = _client(run=_fake_run(RunResult(0, '{"status": "processing", "outputs": []}', "")))
    assert c.result("r")["status"] == "running"


def test_result_failed_surfaces_error():
    c = _client(run=_fake_run(RunResult(0, '{"status": "error", "error": "nsfw blocked"}', "")))
    out = c.result("r")
    assert out["status"] == "failed"
    assert out["error"] == "nsfw blocked"
    assert out["outputs"] == []


def test_result_empty_request_id_is_validation():
    c = _client(run=_fake_run(RunResult(0, "{}", "")))
    try:
        c.result("  ")
        got = None
    except MuapiError as e:
        got = e.code
    assert got == "validation"


def test_result_tolerates_non_list_outputs():
    c = _client(run=_fake_run(RunResult(0, '{"status": "queued", "outputs": null}', "")))
    out = c.result("r")
    assert out["outputs"] == []
    assert out["status"] == "pending"


def test_result_tolerates_non_dict_response():
    c = _client(run=_fake_run(RunResult(0, "null", "")))
    out = c.result("r")
    assert out == {"status": "pending", "outputs": [], "error": None}


def test_normalize_status_known_status_beats_outputs_heuristic():
    assert normalize_status("queued", outputs=[{"url": "x"}]) == "pending"


def test_submit_image_edit_builds_argv():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "e1"}', ""), captured))
    out = c.submit_image_edit("flux-kontext-dev", "make it blue", "https://x/a.png")
    assert out == {"request_id": "e1"}
    assert captured["argv"] == [
        "muapi", "image", "edit", "make it blue",
        "--image", "https://x/a.png",
        "--model", "flux-kontext-dev",
        "--no-wait", "--output-json",
    ]


def test_submit_image_edit_maps_whitelisted_params():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "r"}', ""), captured))
    c.submit_image_edit(
        "gpt4o", "tweak", "https://x/a.png",
        params={"aspect_ratio": "16:9", "num_images": 2, "junk": "x"},
    )
    argv = captured["argv"]
    assert argv[argv.index("--aspect-ratio") + 1] == "16:9"
    assert argv[argv.index("--num-images") + 1] == "2"
    assert "junk" not in argv and "x" not in argv


def test_submit_image_edit_validation_runs_before_subprocess():
    calls = {"n": 0}

    def run(argv, env, timeout):
        calls["n"] += 1
        return RunResult(0, '{"request_id": "r"}', "")

    c = _client(run=run)
    bad = [
        ("", "p", "https://x/a.png"),       # blank model
        ("m", "", "https://x/a.png"),       # blank prompt
        ("m", "p", ""),                     # blank image_url
        ("m", "p", "   "),                  # whitespace image_url
    ]
    for args in bad:
        try:
            c.submit_image_edit(*args)
            code = None
        except MuapiError as e:
            code = e.code
        assert code == "validation"
    assert calls["n"] == 0


def test_submit_video_from_image_builds_argv():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "v1"}', ""), captured))
    out = c.submit_video_from_image("kling-std", "pan slowly", "https://x/a.png")
    assert out == {"request_id": "v1"}
    assert captured["argv"] == [
        "muapi", "video", "from-image", "pan slowly",
        "--image", "https://x/a.png",
        "--model", "kling-std",
        "--no-wait", "--output-json",
    ]


def test_submit_video_from_image_maps_duration():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "r"}', ""), captured))
    c.submit_video_from_image(
        "veo3", "zoom", "https://x/a.png",
        params={"duration": 8, "aspect_ratio": "9:16"},
    )
    argv = captured["argv"]
    assert argv[argv.index("--duration") + 1] == "8"
    assert argv[argv.index("--aspect-ratio") + 1] == "9:16"


def test_submit_video_from_image_validation():
    calls = {"n": 0}

    def run(argv, env, timeout):
        calls["n"] += 1
        return RunResult(0, '{"request_id": "r"}', "")

    c = _client(run=run)
    for args in [("", "p", "u"), ("m", "", "u"), ("m", "p", "  ")]:
        try:
            c.submit_video_from_image(*args)
            code = None
        except MuapiError as e:
            code = e.code
        assert code == "validation"
    assert calls["n"] == 0


def test_submit_effect_video_mode_uses_video_flag():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "fx1"}', ""), captured))
    out = c.submit_effect("video", "explode", video_url="https://x/v.mp4")
    assert out == {"request_id": "fx1"}
    assert captured["argv"] == [
        "muapi", "edit", "effects",
        "--effect", "explode",
        "--mode", "video",
        "--video", "https://x/v.mp4",
        "--no-wait", "--output-json",
    ]


def test_submit_effect_image_mode_uses_image_flag():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "fx2"}', ""), captured))
    c.submit_effect("image", "claymation", image_url="https://x/a.png")
    argv = captured["argv"]
    assert argv[argv.index("--mode") + 1] == "image"
    assert argv[argv.index("--image") + 1] == "https://x/a.png"
    assert "--video" not in argv


def test_submit_effect_rejects_wan_mode():
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "r"}', "")))
    with pytest.raises(MuapiError) as exc:
        c.submit_effect("wan", "anything", image_url="https://example.com/in.jpg")
    assert exc.value.code == "validation"


def test_submit_effect_validation():
    calls = {"n": 0}

    def run(argv, env, timeout):
        calls["n"] += 1
        return RunResult(0, '{"request_id": "r"}', "")

    c = _client(run=run)
    cases = [
        dict(mode="audio", effect="x", video_url="u"),     # bad mode
        dict(mode="video", effect="", video_url="u"),      # blank effect
        dict(mode="video", effect="x"),                    # video mode, no video_url
        dict(mode="image", effect="x"),                    # image mode, no image_url
        dict(mode="wan", effect="x", image_url="u"),       # wan mode is dead
    ]
    for kw in cases:
        try:
            c.submit_effect(**kw)
            code = None
        except MuapiError as e:
            code = e.code
        assert code == "validation", kw
    assert calls["n"] == 0


def test_submit_ai_video_effect_builds_run_argv(monkeypatch):
    client = _client()
    captured = {}

    def fake_submit(argv):
        captured["argv"] = argv
        return {"request_id": "req-123"}

    monkeypatch.setattr(client, "_submit_argv", fake_submit)
    result = client.submit_ai_video_effect("Crush It", "https://example.com/in.jpg")
    assert result == {"request_id": "req-123"}
    assert captured["argv"] == [
        "run", "ai-video-effects",
        "-i", "image_url=https://example.com/in.jpg",
        "-i", "effect=Crush It",
        "-p", AI_EFFECT_DEFAULT_PROMPT,
        "--no-wait", "--output-json",
    ]


def test_submit_ai_video_effect_rejects_non_http_image_url():
    client = _client()
    with pytest.raises(MuapiError) as exc:
        client.submit_ai_video_effect("Cakeify", "file:///etc/passwd")
    assert exc.value.code == "validation"


def test_submit_ai_video_effect_rejects_blank_effect():
    client = _client()
    with pytest.raises(MuapiError) as exc:
        client.submit_ai_video_effect("  ", "https://example.com/in.jpg")
    assert exc.value.code == "validation"


def test_submit_enhance_positional_url_ops():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "u1"}', ""), captured))
    out = c.submit_enhance("upscale", "https://x/a.png")
    assert out == {"request_id": "u1"}
    assert captured["argv"] == [
        "muapi", "enhance", "upscale", "https://x/a.png",
        "--no-wait", "--output-json",
    ]


def test_submit_enhance_accepts_each_positional_op():
    ops = ["upscale", "bg-remove", "skin", "colorize", "ghibli", "anime", "extend", "product-shot"]
    for op in ops:
        captured = {}
        c = _client(run=_fake_run(RunResult(0, '{"request_id": "r"}', ""), captured))
        c.submit_enhance(op, "https://x/a.png")
        assert captured["argv"][1:4] == ["enhance", op, "https://x/a.png"]


def test_submit_enhance_rejects_unknown_op_and_facewap_via_this_path():
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "r"}', "")))
    for op in ["audio", "face-swap", "erase", ""]:
        try:
            c.submit_enhance(op, "https://x/a.png")
            code = None
        except MuapiError as e:
            code = e.code
        assert code == "validation", op


def test_submit_enhance_requires_image_url():
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "r"}', "")))
    try:
        c.submit_enhance("upscale", "  ")
        code = None
    except MuapiError as e:
        code = e.code
    assert code == "validation"


def test_submit_face_swap_builds_argv():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "fs1"}', ""), captured))
    out = c.submit_face_swap("https://x/src.png", "https://x/tgt.png")
    assert out == {"request_id": "fs1"}
    assert captured["argv"] == [
        "muapi", "enhance", "face-swap",
        "--source", "https://x/src.png",
        "--target", "https://x/tgt.png",
        "--mode", "image",
        "--no-wait", "--output-json",
    ]


def test_submit_face_swap_video_mode_and_validation():
    captured = {}
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "r"}', ""), captured))
    c.submit_face_swap("https://x/s.png", "https://x/t.mp4", mode="video")
    assert captured["argv"][captured["argv"].index("--mode") + 1] == "video"

    bad = _client(run=_fake_run(RunResult(0, '{"request_id": "r"}', "")))
    for args, kw in [(("", "t"), {}), (("s", ""), {}), (("s", "t"), {"mode": "audio"})]:
        try:
            bad.submit_face_swap(*args, **kw)
            code = None
        except MuapiError as e:
            code = e.code
        assert code == "validation"


def test_submit_enhance_and_face_swap_reject_non_http_urls():
    c = _client(run=_fake_run(RunResult(0, '{"request_id": "r"}', "")))
    for call in [
        lambda: c.submit_enhance("upscale", "-d /tmp/evil"),
        lambda: c.submit_face_swap("-d x", "https://x/t.png"),
        lambda: c.submit_face_swap("https://x/s.png", "ftp://x/t.png"),
    ]:
        try:
            call()
            code = None
        except MuapiError as e:
            code = e.code
        assert code == "validation"


def test_upload_builds_argv_and_returns_url():
    captured = {}
    payload = '{"url": "https://cdn/up/abc.png"}'
    c = _client(run=_fake_run(RunResult(0, payload, ""), captured))
    out = c.upload("/tmp/abc.png")
    assert out == {"url": "https://cdn/up/abc.png"}
    assert captured["argv"] == ["muapi", "upload", "file", "/tmp/abc.png", "--output-json"]


def test_upload_reads_nested_url_keys():
    # muapi-cli may nest the hosted URL under different keys; accept common ones.
    for payload in [
        '{"file_url": "https://cdn/x"}',
        '{"hosted_url": "https://cdn/x"}',
        '{"result": {"url": "https://cdn/x"}}',
    ]:
        c = _client(run=_fake_run(RunResult(0, payload, "")))
        assert c.upload("/tmp/x.png") == {"url": "https://cdn/x"}


def test_upload_validation_and_missing_url():
    c = _client(run=_fake_run(RunResult(0, "{}", "")))
    # blank path -> validation, no subprocess
    try:
        c.upload("  ")
        code = None
    except MuapiError as e:
        code = e.code
    assert code == "validation"
    # no URL in response -> unknown
    try:
        c.upload("/tmp/x.png")
        code = None
    except MuapiError as e:
        code = e.code
    assert code == "unknown"
