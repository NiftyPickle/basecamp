"""Filesystem layout for the local LLM subsystem.

Everything lives under ``<hermes home>/local-llm/`` where hermes home is
``$HERMES_HOME`` or ``~/.hermes`` (same resolution as env_loader.py).
"""

from __future__ import annotations

import os
from pathlib import Path


def local_llm_root() -> Path:
    home = os.getenv("HERMES_HOME", "").strip()
    base = Path(home) if home else Path.home() / ".hermes"
    return base / "local-llm"


def bin_dir() -> Path:
    return local_llm_root() / "bin"


def models_dir() -> Path:
    return local_llm_root() / "models"


def model_path(model_id: str) -> Path:
    return models_dir() / f"{model_id}.gguf"
