"""Read-only OpenRouter presence + model info for the onboarding gate.

Returns presence booleans and public model slugs ONLY - never key material.
"""

from __future__ import annotations

import os
from typing import Callable, Optional

from hermes_cli.council.config import COUNCIL_DEFAULT_MODELS, FREE_CHAT_DEFAULT_MODEL


def _default_key_checker() -> bool:
    from hermes_cli.auth import has_usable_secret

    return bool(
        has_usable_secret(os.getenv("OPENROUTER_API_KEY"))
        or has_usable_secret(os.getenv("OPENAI_API_KEY"))
    )


def _default_free_models() -> list[str]:
    """Curated OpenRouter :free slugs, falling back to the pinned default."""
    try:
        from hermes_cli.model_catalog import get_curated_openrouter_models

        curated = get_curated_openrouter_models() or []
        free = [slug for (slug, _label) in curated if slug.endswith(":free")]
        if free:
            return free
    except Exception:
        pass
    return [FREE_CHAT_DEFAULT_MODEL]


def build_openrouter_info(
    *,
    key_checker: Optional[Callable[[], bool]] = None,
    free_models_provider: Optional[Callable[[], list[str]]] = None,
) -> dict:
    key_present = (key_checker or _default_key_checker)()
    free_models = (free_models_provider or _default_free_models)()
    # All default council members route through the single OpenRouter key, so a
    # usable key unlocks the whole council (OpenRouter bills per member call).
    council_available = bool(key_present)
    return {
        "key_present": key_present,
        "free_models": free_models,
        "council_available": council_available,
        "council_default_models": list(COUNCIL_DEFAULT_MODELS),
    }
