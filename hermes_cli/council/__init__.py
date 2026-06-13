"""Council Mode engine: provider-agnostic multi-model deliberation."""

from hermes_cli.council.config import (
    COUNCIL_DEFAULT_MODELS,
    COUNCIL_MEMBER_TIMEOUT,
    COUNCIL_MIN_SURVIVORS,
    COUNCIL_SYNTHESIZER,
    FREE_CHAT_DEFAULT_MODEL,
)
from hermes_cli.council.orchestrator import CouncilOrchestrator, EventSink
from hermes_cli.council.provider_client import CouncilMemberError, ProviderClient

__all__ = [
    "COUNCIL_DEFAULT_MODELS",
    "COUNCIL_MEMBER_TIMEOUT",
    "COUNCIL_MIN_SURVIVORS",
    "COUNCIL_SYNTHESIZER",
    "FREE_CHAT_DEFAULT_MODEL",
    "CouncilMemberError",
    "CouncilOrchestrator",
    "EventSink",
    "ProviderClient",
]
