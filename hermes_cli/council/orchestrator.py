"""Council 2-round deliberation orchestrator.

Transport-agnostic: emits to an EventSink so it is testable without a PTY or
WebSocket. Depends only on an injected client exposing
`async complete(model_ref, messages, timeout) -> str`.
"""

from __future__ import annotations

import asyncio
from typing import Optional, Protocol

from hermes_cli.council.config import (
    COUNCIL_MEMBER_TIMEOUT,
    COUNCIL_MIN_SURVIVORS,
    COUNCIL_SYNTHESIZER,
    build_critique_prompt,
    build_synthesis_prompt,
)
from hermes_cli.council.provider_client import CouncilMemberError


class EventSink:
    """Override these to receive orchestrator progress. Default no-ops."""

    def member_started(self, model_ref: str) -> None: ...
    def member_finished(self, model_ref: str, ok: bool) -> None: ...
    def delta(self, text: str) -> None: ...
    def complete(self, verdict_text: str, deliberation: dict) -> None: ...


class _Client(Protocol):
    async def complete(self, model_ref: str, messages: list[dict], timeout: float) -> str: ...


class CouncilOrchestrator:
    def __init__(
        self,
        client: _Client,
        members: Optional[list[str]] = None,
        synthesizer: str = COUNCIL_SYNTHESIZER,
        timeout: float = COUNCIL_MEMBER_TIMEOUT,
        min_survivors: int = COUNCIL_MIN_SURVIVORS,
    ):
        from hermes_cli.council.config import COUNCIL_DEFAULT_MODELS

        self._client = client
        self._members = list(members) if members else list(COUNCIL_DEFAULT_MODELS)
        self._synthesizer = synthesizer
        self._timeout = timeout
        self._min_survivors = min_survivors

    @staticmethod
    def _safe(call) -> None:
        """Invoke a sink callback, swallowing any error it raises.

        A custom EventSink (e.g. the Plan 2 WebSocket sink) can raise. Such a
        failure must never cancel sibling tasks via asyncio.gather or escape
        run(); it is not the orchestrator's concern.
        """
        try:
            call()
        except Exception:
            pass

    async def _ask(self, model_ref: str, messages: list[dict], sink: EventSink):
        self._safe(lambda: sink.member_started(model_ref))
        try:
            answer = await self._client.complete(model_ref, messages, self._timeout)
            self._safe(lambda: sink.member_finished(model_ref, True))
            return (model_ref, answer, None)
        except CouncilMemberError:
            self._safe(lambda: sink.member_finished(model_ref, False))
            return (model_ref, None, "error")

    def _members_blob(self, answer_map: dict, critique_map: dict) -> list[dict]:
        blob = []
        for m in self._members:
            if m in answer_map:
                blob.append(
                    {
                        "model": m,
                        "answer": answer_map[m],
                        "critique": critique_map.get(m),
                        "ok": True,
                    }
                )
            else:
                blob.append(
                    {"model": m, "answer": None, "critique": None, "ok": False}
                )
        return blob

    def _fail_turn(self, sink: EventSink, text: str, members_blob: list[dict]) -> None:
        """Terminal frames for a degraded turn.

        Both the message text and a complete frame must go out: the frontend
        reducer only clears the streaming flag on message.complete or
        agent_error, and the composer gates Send on it.
        """
        self._safe(lambda: sink.delta(text))
        deliberation = {"members": members_blob, "synthesizer": self._synthesizer}
        self._safe(lambda: sink.complete(text, deliberation))

    async def run(self, question: str, sink: EventSink) -> None:
        # Round 1: independent answers, concurrent.
        round1 = await asyncio.gather(
            *(
                self._ask(m, [{"role": "user", "content": question}], sink)
                for m in self._members
            )
        )
        survivors = [(m, ans) for (m, ans, err) in round1 if err is None and ans]
        answer_map = dict(survivors)

        if len(survivors) < self._min_survivors:
            self._fail_turn(
                sink,
                "Council could not reach the minimum number of members for a "
                "verdict. Try again, or turn Council off for a single-model reply.",
                self._members_blob(answer_map, {}),
            )
            return

        # Round 2: each survivor critiques the others, concurrent.

        async def _critique(model_ref: str, own: str):
            peers = [(o, a) for (o, a) in survivors if o != model_ref]
            prompt = build_critique_prompt(question, own, peers)
            self._safe(lambda: sink.member_started(model_ref))
            try:
                crit = await self._client.complete(
                    model_ref, [{"role": "user", "content": prompt}], self._timeout
                )
                self._safe(lambda: sink.member_finished(model_ref, True))
                return (model_ref, crit)
            except CouncilMemberError:
                self._safe(lambda: sink.member_finished(model_ref, False))
                return (model_ref, None)

        round2 = await asyncio.gather(
            *(_critique(m, ans) for (m, ans) in survivors)
        )
        critique_map = dict(round2)
        members_blob = self._members_blob(answer_map, critique_map)

        # Synthesis.
        synth_prompt = build_synthesis_prompt(question, members_blob)
        try:
            verdict = await self._client.complete(
                self._synthesizer,
                [{"role": "user", "content": synth_prompt}],
                self._timeout,
            )
        except CouncilMemberError:
            self._fail_turn(
                sink,
                "Council synthesis failed. Try again or turn Council off.",
                members_blob,
            )
            return

        self._safe(lambda: sink.delta(verdict))
        deliberation = {"members": members_blob, "synthesizer": self._synthesizer}
        self._safe(lambda: sink.complete(verdict, deliberation))
