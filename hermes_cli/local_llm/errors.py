"""Local LLM error types. Messages are user-facing - keep them short,
friendly, and free of paths, stderr, or stack detail."""

from __future__ import annotations


class LocalLLMError(Exception):
    """Base error for the local model subsystem."""


class DownloadBusyError(LocalLLMError):
    """Another download is already in progress (one at a time in v1)."""


class InsufficientDiskError(LocalLLMError):
    """Not enough free disk for the requested download."""
