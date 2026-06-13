import asyncio

import pytest

from hermes_cli.council.provider_client import CouncilMemberError, ProviderClient, _scrub


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content):
        self.choices = [_FakeChoice(content)]


class _FakeChatCompletions:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._error:
            raise self._error
        return self._response


class _FakeClient:
    def __init__(self, response=None, error=None):
        self.chat = type("C", (), {})()
        self.chat.completions = _FakeChatCompletions(response, error)


def test_scrub_removes_key():
    assert _scrub("boom sk-or-v1-SECRET happened", "sk-or-v1-SECRET") == "boom *** happened"


def test_scrub_handles_none_key():
    assert _scrub("plain error", None) == "plain error"


def test_complete_returns_text():
    fake = _FakeClient(response=_FakeResponse("the answer"))
    client = ProviderClient(client_factory=lambda: fake, api_key="sk-or-v1-X")
    out = asyncio.run(
        client.complete("anthropic/claude-sonnet-4.5", [{"role": "user", "content": "hi"}], timeout=5)
    )
    assert out == "the answer"
    assert fake.chat.completions.calls[0]["model"] == "anthropic/claude-sonnet-4.5"


def test_complete_missing_key_raises_member_error():
    client = ProviderClient(client_factory=lambda: _FakeClient(), api_key="")
    with pytest.raises(CouncilMemberError):
        asyncio.run(client.complete("m", [{"role": "user", "content": "x"}], timeout=5))


def test_complete_scrubs_secret_from_upstream_error():
    err = RuntimeError("401 unauthorized for key sk-or-v1-LEAK")
    fake = _FakeClient(error=err)
    client = ProviderClient(client_factory=lambda: fake, api_key="sk-or-v1-LEAK")
    with pytest.raises(CouncilMemberError) as ei:
        asyncio.run(client.complete("m", [{"role": "user", "content": "x"}], timeout=5))
    assert "sk-or-v1-LEAK" not in str(ei.value)
    assert "***" in str(ei.value)
