"""Isolated council/free-chat WebSocket handler and event-sink adapter.

Speaks the same JSON-RPC + event-frame protocol as /api/ws so the frontend
ChatSocket + chat-reducer are reused verbatim, but has NO PTY/server
dependency - this endpoint never drives the deep agent loop.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, Callable

from hermes_cli.council.config import FREE_CHAT_DEFAULT_MODEL
from hermes_cli.council.orchestrator import CouncilOrchestrator, EventSink
from hermes_cli.council.provider_client import CouncilMemberError, ProviderClient
from hermes_cli.local_llm.errors import LocalLLMError

_FRIENDLY = {
    "anthropic/claude-sonnet-4.5": "Claude",
    "openai/gpt-5.1": "GPT-5.1",
    "google/gemini-2.5-pro": "Gemini",
    "deepseek/deepseek-chat-v3-0324": "DeepSeek",
}


def friendly_label(model_ref: str) -> str:
    if model_ref in _FRIENDLY:
        return _FRIENDLY[model_ref]
    tail = model_ref.split("/")[-1]
    return tail.replace(":free", "")


def _with_labels(deliberation: dict) -> dict:
    """Return a copy of the deliberation blob enriched with friendly labels.

    Single source of truth for slug-to-label mapping: the frontend renders the
    provided labels and only derives from the slug for blobs lacking them.
    """
    labeled = {
        **deliberation,
        "members": [
            {**m, "label": friendly_label(m.get("model", ""))}
            for m in deliberation.get("members", [])
        ],
    }
    synthesizer = deliberation.get("synthesizer")
    if isinstance(synthesizer, str) and synthesizer:
        labeled["synthesizer_label"] = friendly_label(synthesizer)
    return labeled


def make_event_frame(event_type: str, session_id: str, payload: dict) -> dict:
    return {
        "jsonrpc": "2.0",
        "method": "event",
        "params": {
            "type": event_type,
            "session_id": session_id,
            "payload": payload,
        },
    }


class WsEventSink(EventSink):
    """Maps CouncilOrchestrator events to JSON-RPC event frames.

    `send_frame` is a synchronous callable; the handler wires it to an
    asyncio.Queue so frames stream live without awaiting inside the sink.
    """

    def __init__(self, session_id: str, send_frame: Callable[[dict], None]):
        self._sid = session_id
        self._send = send_frame

    def member_started(self, model_ref: str) -> None:
        self._send(
            make_event_frame(
                "tool.start",
                self._sid,
                {"tool_id": model_ref, "tool_name": friendly_label(model_ref)},
            )
        )

    def member_finished(self, model_ref: str, ok: bool) -> None:
        self._send(
            make_event_frame(
                "tool.complete",
                self._sid,
                {"tool_id": model_ref, "ok": ok},
            )
        )

    def delta(self, text: str) -> None:
        self._send(make_event_frame("message.delta", self._sid, {"text": text}))

    def complete(self, verdict_text: str, deliberation: dict) -> None:
        self._send(
            make_event_frame(
                "message.complete",
                self._sid,
                {"text": verdict_text, "deliberation": _with_labels(deliberation)},
            )
        )


try:  # FastAPI/starlette disconnect, aliased so tests can import it
    from starlette.websockets import WebSocketDisconnect as WSDisconnect
except Exception:  # pragma: no cover - fallback for non-starlette test envs
    class WSDisconnect(Exception):
        pass


def _new_sid() -> str:
    return "council-" + uuid.uuid4().hex[:12]


async def _run_council(question: str, members, sink: WsEventSink, **kwargs) -> None:
    """Run the orchestrator against the injected sink. Patchable in tests."""
    client = ProviderClient()
    orch = CouncilOrchestrator(client=client, members=members or None)
    await orch.run(question, sink)


def _local_client_factory(base_url: str):
    """OpenAI-compatible client pointed at the local llama-server. The key is
    a placeholder - llama-server ignores it - but it satisfies ProviderClient's
    credential check."""

    def _factory():
        from openai import OpenAI

        return OpenAI(api_key="local", base_url=f"{base_url}/v1")

    return _factory


async def _run_free_chat(text: str, model: str, send_frame, session_id: str) -> None:
    """Single completion (cloud or local), streamed as message.* frames. Patchable.

    Every failure path emits a terminal agent_error frame so the composer
    never wedges - same rule as council _fail_turn.
    """
    send_frame(make_event_frame("message.start", session_id, {}))
    try:
        if model.startswith("local/"):
            from hermes_cli.local_llm import runtime

            base_url = await asyncio.to_thread(
                runtime.ensure_running, model.removeprefix("local/")
            )
            client = ProviderClient(
                client_factory=_local_client_factory(base_url), api_key="local"
            )
        else:
            client = ProviderClient()
        answer = await client.complete(
            model, [{"role": "user", "content": text}], timeout=90.0
        )
        send_frame(make_event_frame("message.delta", session_id, {"text": answer}))
        send_frame(make_event_frame("message.complete", session_id, {"text": answer}))
    except (CouncilMemberError, LocalLLMError) as exc:
        send_frame(
            make_event_frame("agent_error", session_id, {"message": str(exc)})
        )


async def handle_council_ws(ws: Any) -> None:
    """One isolated council/free-chat session. No PTY, no server.dispatch."""
    await ws.accept()
    queue: asyncio.Queue = asyncio.Queue()

    def send_frame(frame: dict) -> None:
        queue.put_nowait(frame)

    async def _drain(stop_after_turn: asyncio.Event) -> None:
        # Drain frames to the socket until told to stop and the queue is empty.
        while not (stop_after_turn.is_set() and queue.empty()):
            try:
                frame = await asyncio.wait_for(queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                continue
            try:
                await ws.send_text(json.dumps(frame))
            except Exception:
                return  # client gone; drop remaining frames

    # gateway.ready first (no session id yet)
    await ws.send_text(
        json.dumps(make_event_frame("gateway.ready", "", {}))
    )

    while True:
        try:
            raw = await ws.receive_text()
        except WSDisconnect:
            break
        except Exception:
            break

        line = (raw or "").strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            await ws.send_text(
                json.dumps({"jsonrpc": "2.0", "error": {"code": -32700, "message": "parse error"}, "id": None})
            )
            continue

        method = req.get("method")
        req_id = req.get("id")
        params = req.get("params") or {}

        if method == "session.create":
            sid = _new_sid()
            await ws.send_text(
                json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {"session_id": sid}})
            )
            continue

        if method == "prompt.submit":
            sid = params.get("session_id") or _new_sid()
            text = params.get("text") or ""
            council_on = bool(params.get("council"))
            models = params.get("models")

            # ack the request id
            await ws.send_text(
                json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {"ok": True}})
            )

            stop = asyncio.Event()
            drainer = asyncio.create_task(_drain(stop))
            try:
                if council_on:
                    send_frame(make_event_frame("message.start", sid, {}))
                    sink = WsEventSink(session_id=sid, send_frame=send_frame)
                    # Known v1 tradeoff: a client disconnect mid-council does
                    # not cancel the orchestrator; the turn runs to completion
                    # (frames are dropped by _drain once the socket is gone).
                    # Acceptable for the localhost single-operator dashboard;
                    # revisit with a disconnect-watcher if council moves off
                    # loopback.
                    await _run_council(text, models, sink)
                else:
                    model = (models or [FREE_CHAT_DEFAULT_MODEL])[0]
                    await _run_free_chat(text, model, send_frame, sid)
            except Exception:  # noqa: BLE001
                send_frame(make_event_frame("agent_error", sid, {"message": "internal error"}))
            finally:
                stop.set()
                await drainer
            continue

        # unknown method
        await ws.send_text(
            json.dumps({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": "method not found"}})
        )
