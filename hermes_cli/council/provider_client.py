"""Async, single-shot completion client for council members.

Defaults to the OpenRouter aggregator (the council's default model slugs are
OpenRouter ids that route to every lab), reusing hermes-agent's existing
OpenRouter client building blocks. All keys stay server-side; upstream error
bodies are scrubbed of any secret before they propagate. A missing credential
raises CouncilMemberError so the orchestrator can drop that member without
failing the whole turn.
"""

from __future__ import annotations

import asyncio
import os
from typing import Callable, Optional


class CouncilMemberError(Exception):
    """A single council member could not produce an answer (cred/timeout/upstream)."""


def _scrub(text: str, key: Optional[str]) -> str:
    key = (key or "").strip()
    msg = (text or "").strip() or "council member error"
    if key:
        msg = msg.replace(key, "***")
    return msg[:500]


def _default_api_key() -> str:
    return (os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip()


def _default_client_factory():
    """Build a sync OpenAI client pointed at OpenRouter (matches repo pattern)."""
    from openai import OpenAI

    from agent.auxiliary_client import build_or_headers
    from hermes_constants import OPENROUTER_BASE_URL

    return OpenAI(
        api_key=_default_api_key(),
        base_url=OPENROUTER_BASE_URL,
        default_headers=build_or_headers(),
    )


class ProviderClient:
    """One async non-streaming completion per call. Fan-out is the caller's job."""

    def __init__(
        self,
        client_factory: Optional[Callable[[], object]] = None,
        api_key: Optional[str] = None,
    ):
        self._client_factory = client_factory or _default_client_factory
        self._api_key = _default_api_key() if api_key is None else api_key

    async def complete(self, model_ref: str, messages: list[dict], timeout: float) -> str:
        if not (self._api_key or "").strip():
            raise CouncilMemberError(f"no usable credential for member '{model_ref}'")

        def _call() -> str:
            client = self._client_factory()
            resp = client.chat.completions.create(
                model=model_ref,
                messages=messages,
                timeout=timeout,
            )
            return (resp.choices[0].message.content or "").strip()

        try:
            return await asyncio.wait_for(asyncio.to_thread(_call), timeout=timeout + 5)
        except asyncio.TimeoutError as exc:
            raise CouncilMemberError(f"member '{model_ref}' timed out") from exc
        except CouncilMemberError:
            raise
        except Exception as exc:  # noqa: BLE001 - scrub then re-wrap
            raise CouncilMemberError(_scrub(str(exc), self._api_key)) from exc
