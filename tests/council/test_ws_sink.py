from hermes_cli.council.ws import friendly_label, make_event_frame


def test_make_event_frame_shape():
    frame = make_event_frame("message.delta", "sess-1", {"text": "hi"})
    assert frame == {
        "jsonrpc": "2.0",
        "method": "event",
        "params": {
            "type": "message.delta",
            "session_id": "sess-1",
            "payload": {"text": "hi"},
        },
    }


def test_friendly_label_known_and_derived():
    assert friendly_label("anthropic/claude-sonnet-4.5") == "Claude"
    assert friendly_label("openai/gpt-5.1") == "GPT-5.1"
    assert friendly_label("google/gemini-2.5-pro") == "Gemini"
    assert friendly_label("deepseek/deepseek-chat-v3-0324") == "DeepSeek"
    # unknown slug -> derive a short label from the path tail
    assert friendly_label("someorg/mystery-model") == "mystery-model"


from hermes_cli.council.ws import WsEventSink


def _sink_capture():
    sent = []
    sink = WsEventSink(session_id="s1", send_frame=sent.append)
    return sink, sent


def test_member_started_maps_to_tool_start():
    sink, sent = _sink_capture()
    sink.member_started("deepseek/deepseek-chat-v3-0324")
    f = sent[0]
    assert f["params"]["type"] == "tool.start"
    assert f["params"]["session_id"] == "s1"
    assert f["params"]["payload"]["tool_name"] == "DeepSeek"
    assert f["params"]["payload"]["tool_id"] == "deepseek/deepseek-chat-v3-0324"


def test_member_finished_ok_and_error_map_to_tool_complete():
    sink, sent = _sink_capture()
    sink.member_finished("openai/gpt-5.1", True)
    sink.member_finished("openai/gpt-5.1", False)
    assert sent[0]["params"]["type"] == "tool.complete"
    assert sent[0]["params"]["payload"]["ok"] is True
    assert sent[1]["params"]["payload"]["ok"] is False


def test_delta_and_complete_map_correctly():
    sink, sent = _sink_capture()
    sink.delta("partial")
    deliberation = {"members": [], "synthesizer": "anthropic/claude-sonnet-4.5"}
    sink.complete("VERDICT", deliberation)
    assert sent[0]["params"]["type"] == "message.delta"
    assert sent[0]["params"]["payload"]["text"] == "partial"
    assert sent[1]["params"]["type"] == "message.complete"
    assert sent[1]["params"]["payload"]["text"] == "VERDICT"
    out = sent[1]["params"]["payload"]["deliberation"]
    assert out["members"] == []
    assert out["synthesizer"] == "anthropic/claude-sonnet-4.5"


def test_complete_enriches_deliberation_with_friendly_labels():
    sink, sent = _sink_capture()
    deliberation = {
        "members": [
            {"model": "openai/gpt-5.1", "answer": "a", "critique": None, "ok": True},
            {"model": "someorg/mystery-model:free", "answer": None, "critique": None, "ok": False},
        ],
        "synthesizer": "anthropic/claude-sonnet-4.5",
    }
    sink.complete("VERDICT", deliberation)

    out = sent[0]["params"]["payload"]["deliberation"]
    by_model = {m["model"]: m for m in out["members"]}
    assert by_model["openai/gpt-5.1"]["label"] == "GPT-5.1"
    assert by_model["someorg/mystery-model:free"]["label"] == "mystery-model"
    assert out["synthesizer_label"] == "Claude"
    # original member fields survive enrichment
    assert by_model["openai/gpt-5.1"]["answer"] == "a"
    assert by_model["openai/gpt-5.1"]["ok"] is True
    # input blob is not mutated
    assert "label" not in deliberation["members"][0]
    assert "synthesizer_label" not in deliberation
