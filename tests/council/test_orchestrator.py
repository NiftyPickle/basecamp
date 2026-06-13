import asyncio

import pytest

from hermes_cli.council.orchestrator import CouncilOrchestrator, EventSink
from hermes_cli.council.provider_client import CouncilMemberError


class RecordingSink(EventSink):
    def __init__(self):
        self.events = []

    def member_started(self, model_ref):
        self.events.append(("started", model_ref))

    def member_finished(self, model_ref, ok):
        self.events.append(("finished", model_ref, ok))

    def delta(self, text):
        self.events.append(("delta", text))

    def complete(self, verdict_text, deliberation):
        self.events.append(("complete", verdict_text, deliberation))


class ScriptedClient:
    """Returns canned text routed by per-model call ordinal (not prompt wording).

    For a given model: 1st call -> initial answer, 2nd call -> critique,
    3rd call -> synthesis (only the synthesizer is called a third time).
    Routing is independent of prompt text, so rewording a prompt builder
    cannot silently return wrong-round data.
    """

    def __init__(self, answers, critiques, synthesis, fail=()):
        self.answers = answers
        self.critiques = critiques
        self.synthesis = synthesis
        self.fail = set(fail)
        self.calls = []
        self._per_model = {}

    async def complete(self, model_ref, messages, timeout):
        self.calls.append(model_ref)
        if model_ref in self.fail:
            raise CouncilMemberError(f"{model_ref} down")
        ordinal = self._per_model.get(model_ref, 0) + 1
        self._per_model[model_ref] = ordinal
        if ordinal == 1:
            return self.answers[model_ref]
        if ordinal == 2:
            return self.critiques[model_ref]
        return self.synthesis


def _orch(client, members=("a", "b", "c"), synthesizer="a"):
    return CouncilOrchestrator(
        client=client, members=list(members), synthesizer=synthesizer,
        timeout=5, min_survivors=2,
    )


def test_happy_path_two_rounds_then_synthesis():
    client = ScriptedClient(
        answers={"a": "ans-a", "b": "ans-b", "c": "ans-c"},
        critiques={"a": "crit-a", "b": "crit-b", "c": "crit-c"},
        synthesis="VERDICT",
    )
    sink = RecordingSink()
    asyncio.run(_orch(client).run("the question?", sink))

    # round 1 + round 2 = 6 member calls, + 1 synthesis = 7
    assert len(client.calls) == 7
    complete = [e for e in sink.events if e[0] == "complete"][0]
    assert complete[1] == "VERDICT"
    deliberation = complete[2]
    assert deliberation["synthesizer"] == "a"
    assert {m["model"] for m in deliberation["members"]} == {"a", "b", "c"}
    assert all(m["ok"] for m in deliberation["members"])
    assert all(m["critique"] for m in deliberation["members"])


def test_failed_member_dropped_but_turn_survives():
    client = ScriptedClient(
        answers={"a": "ans-a", "b": "ans-b", "c": "ans-c"},
        critiques={"a": "crit-a", "b": "crit-b", "c": "crit-c"},
        synthesis="VERDICT",
        fail=("c",),
    )
    sink = RecordingSink()
    asyncio.run(_orch(client).run("q?", sink))

    finished = [e for e in sink.events if e[0] == "finished"]
    assert ("finished", "c", False) in finished
    complete = [e for e in sink.events if e[0] == "complete"][0]
    members = complete[2]["members"]
    c = [m for m in members if m["model"] == "c"][0]
    assert c["ok"] is False
    # survivors a,b produced a verdict
    assert complete[1] == "VERDICT"


def test_aborts_below_min_survivors():
    client = ScriptedClient(
        answers={"a": "ans-a", "b": "ans-b", "c": "ans-c"},
        critiques={},
        synthesis="VERDICT",
        fail=("b", "c"),
    )
    sink = RecordingSink()
    asyncio.run(_orch(client).run("q?", sink))

    # round 1 only: no critique round, no synthesis call
    assert len(client.calls) == 3
    # failure surfaced via the sink, not raised
    assert any(e[0] == "delta" and "council" in e[1].lower() for e in sink.events)


def test_below_min_survivors_emits_terminal_complete():
    client = ScriptedClient(
        answers={"a": "ans-a", "b": "ans-b", "c": "ans-c"},
        critiques={},
        synthesis="VERDICT",
        fail=("b", "c"),
    )
    sink = RecordingSink()
    asyncio.run(_orch(client).run("q?", sink))

    completes = [e for e in sink.events if e[0] == "complete"]
    assert len(completes) == 1
    _, text, deliberation = completes[0]
    assert "council" in text.lower()
    assert deliberation["synthesizer"] == "a"
    by_model = {m["model"]: m for m in deliberation["members"]}
    assert set(by_model) == {"a", "b", "c"}
    assert by_model["a"]["ok"] is True
    assert by_model["b"]["ok"] is False
    assert by_model["c"]["ok"] is False


def test_synthesis_failure_emits_terminal_complete():
    client = ScriptedClient(
        answers={"a": "ans-a", "b": "ans-b", "c": "ans-c"},
        critiques={"a": "crit-a", "b": "crit-b", "c": "crit-c"},
        synthesis="VERDICT",
        fail=("s",),
    )
    sink = RecordingSink()
    asyncio.run(_orch(client, synthesizer="s").run("q?", sink))

    # failure message surfaced as a delta
    assert any(e[0] == "delta" and "synthesis" in e[1].lower() for e in sink.events)
    completes = [e for e in sink.events if e[0] == "complete"]
    assert len(completes) == 1
    _, text, deliberation = completes[0]
    assert "synthesis" in text.lower()
    assert deliberation["synthesizer"] == "s"
    assert all(m["ok"] for m in deliberation["members"])


def test_started_emitted_before_finished_for_each_member():
    client = ScriptedClient(
        answers={"a": "ans-a", "b": "ans-b", "c": "ans-c"},
        critiques={"a": "c", "b": "c", "c": "c"},
        synthesis="V",
    )
    sink = RecordingSink()
    asyncio.run(_orch(client).run("q?", sink))
    for m in ("a", "b", "c"):
        started = next(i for i, e in enumerate(sink.events) if e == ("started", m))
        finished = next(i for i, e in enumerate(sink.events) if e[:2] == ("finished", m))
        assert started < finished
