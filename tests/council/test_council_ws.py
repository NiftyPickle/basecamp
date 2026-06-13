import asyncio
import json

import pytest

from hermes_cli.council import ws as council_ws
from hermes_cli.council.orchestrator import CouncilOrchestrator
from hermes_cli.council.provider_client import CouncilMemberError


class FakeWS:
    def __init__(self, inbound):
        self._inbound = list(inbound)
        self.sent = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def receive_text(self):
        if not self._inbound:
            raise council_ws.WSDisconnect()
        return self._inbound.pop(0)

    async def send_text(self, text):
        self.sent.append(json.loads(text))


def _types(ws):
    return [m["params"]["type"] for m in ws.sent if m.get("method") == "event"]


def test_council_turn_emits_ready_start_and_complete(monkeypatch):
    async def fake_run_council(question, members, sink, **kwargs):
        sink.member_started("openai/gpt-5.1")
        sink.member_finished("openai/gpt-5.1", True)
        sink.delta("VERDICT")
        sink.complete("VERDICT", {"members": [], "synthesizer": "x"})

    monkeypatch.setattr(council_ws, "_run_council", fake_run_council)

    ws = FakeWS(
        [
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "session.create", "params": {}}),
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "prompt.submit",
                    "params": {"session_id": "s1", "text": "q?", "council": True},
                }
            ),
        ]
    )
    asyncio.run(council_ws.handle_council_ws(ws))

    types = _types(ws)
    assert types[0] == "gateway.ready"
    assert "message.start" in types
    assert "tool.start" in types
    assert "tool.complete" in types
    assert types[-1] == "message.complete"


def test_free_chat_turn_streams_single_completion(monkeypatch):
    async def fake_free(text, model, send_frame, session_id):
        send_frame(council_ws.make_event_frame("message.start", session_id, {}))
        send_frame(council_ws.make_event_frame("message.delta", session_id, {"text": "free answer"}))
        send_frame(council_ws.make_event_frame("message.complete", session_id, {"text": "free answer"}))

    monkeypatch.setattr(council_ws, "_run_free_chat", fake_free)

    ws = FakeWS(
        [
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "prompt.submit",
                    "params": {"session_id": "s1", "text": "hi", "council": False},
                }
            ),
        ]
    )
    asyncio.run(council_ws.handle_council_ws(ws))
    types = _types(ws)
    assert "message.start" in types
    assert types[-1] == "message.complete"
    assert any(m["params"]["payload"].get("text") == "free answer" for m in ws.sent if m.get("method") == "event")


def _council_prompt_ws():
    return FakeWS(
        [
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "prompt.submit",
                    "params": {"session_id": "s1", "text": "q?", "council": True},
                }
            ),
        ]
    )


def test_no_quorum_degraded_turn_emits_terminal_frame(monkeypatch):
    """All members fail round 1: the turn must still end with a terminal frame
    (message.complete or agent_error), or the composer wedges on streaming."""

    class AllFailClient:
        async def complete(self, model_ref, messages, timeout):
            raise CouncilMemberError("member down")

    async def degraded_run(question, members, sink, **kwargs):
        orch = CouncilOrchestrator(
            client=AllFailClient(), members=["a", "b"], synthesizer="s",
            timeout=1, min_survivors=2,
        )
        await orch.run(question, sink)

    monkeypatch.setattr(council_ws, "_run_council", degraded_run)

    ws = _council_prompt_ws()
    asyncio.run(council_ws.handle_council_ws(ws))

    types = _types(ws)
    assert "message.start" in types
    assert types[-1] in ("message.complete", "agent_error")


def test_synthesis_failure_degraded_turn_emits_terminal_frame(monkeypatch):
    """Members answer but the synthesizer fails: terminal frame still required."""

    class SynthFailClient:
        async def complete(self, model_ref, messages, timeout):
            if model_ref == "s":
                raise CouncilMemberError("synthesizer down")
            return f"answer from {model_ref}"

    async def degraded_run(question, members, sink, **kwargs):
        orch = CouncilOrchestrator(
            client=SynthFailClient(), members=["a", "b"], synthesizer="s",
            timeout=1, min_survivors=2,
        )
        await orch.run(question, sink)

    monkeypatch.setattr(council_ws, "_run_council", degraded_run)

    ws = _council_prompt_ws()
    asyncio.run(council_ws.handle_council_ws(ws))

    types = _types(ws)
    assert "message.start" in types
    assert types[-1] in ("message.complete", "agent_error")


def test_local_model_ref_dispatches_to_local_runtime(monkeypatch):
    calls = {}

    def fake_ensure_running(model_id):
        calls["model_id"] = model_id
        return "http://127.0.0.1:5555"

    class FakeClient:
        def __init__(self, *args, **kwargs):
            calls["client_kwargs"] = kwargs

        async def complete(self, model, messages, timeout):
            calls["completed_model"] = model
            return "local answer"

    monkeypatch.setattr(
        "hermes_cli.local_llm.runtime.ensure_running", fake_ensure_running
    )
    monkeypatch.setattr(council_ws, "ProviderClient", FakeClient)

    ws = FakeWS(
        [
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "prompt.submit",
                    "params": {
                        "session_id": "s1",
                        "text": "hi",
                        "council": False,
                        "models": ["local/qwen2.5-7b-instruct-q4"],
                    },
                }
            )
        ]
    )
    asyncio.run(council_ws.handle_council_ws(ws))

    assert calls["model_id"] == "qwen2.5-7b-instruct-q4"
    assert calls["client_kwargs"].get("api_key") == "local"
    types = _types(ws)
    assert "message.start" in types
    assert "message.complete" in types


def test_local_runtime_failure_emits_terminal_agent_error(monkeypatch):
    from hermes_cli.local_llm.errors import LocalLLMError

    def boom(model_id):
        raise LocalLLMError(
            "local model not installed - download it from the model picker"
        )

    monkeypatch.setattr("hermes_cli.local_llm.runtime.ensure_running", boom)

    ws = FakeWS(
        [
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "prompt.submit",
                    "params": {
                        "session_id": "s1",
                        "text": "hi",
                        "council": False,
                        "models": ["local/qwen2.5-7b-instruct-q4"],
                    },
                }
            )
        ]
    )
    asyncio.run(council_ws.handle_council_ws(ws))

    types = _types(ws)
    assert "message.start" in types
    assert "agent_error" in types
    errors = [
        m["params"]["payload"]["message"]
        for m in ws.sent
        if m.get("method") == "event" and m["params"]["type"] == "agent_error"
    ]
    assert errors == [
        "local model not installed - download it from the model picker"
    ]


def test_parse_error_returns_minus_32700():
    ws = FakeWS(["not json"])
    asyncio.run(council_ws.handle_council_ws(ws))
    errors = [m for m in ws.sent if "error" in m]
    assert len(errors) == 1
    assert errors[0]["error"]["code"] == -32700
    assert errors[0]["id"] is None


def test_unknown_method_returns_minus_32601():
    ws = FakeWS(
        [json.dumps({"jsonrpc": "2.0", "id": 7, "method": "nope", "params": {}})]
    )
    asyncio.run(council_ws.handle_council_ws(ws))
    errors = [m for m in ws.sent if "error" in m]
    assert len(errors) == 1
    assert errors[0]["error"]["code"] == -32601
    assert errors[0]["id"] == 7


def test_internal_error_is_scrubbed_to_generic_message(monkeypatch):
    async def boom(question, members, sink, **kwargs):
        raise RuntimeError("secret sk-or-v1-abc")

    monkeypatch.setattr(council_ws, "_run_council", boom)

    ws = FakeWS(
        [
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "prompt.submit",
                    "params": {"session_id": "s1", "text": "q?", "council": True},
                }
            ),
        ]
    )
    asyncio.run(council_ws.handle_council_ws(ws))

    agent_errors = [
        m
        for m in ws.sent
        if m.get("method") == "event" and m["params"]["type"] == "agent_error"
    ]
    assert len(agent_errors) == 1
    assert agent_errors[0]["params"]["payload"] == {"message": "internal error"}
