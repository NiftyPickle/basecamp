"""Curated, pinned local model and llama-server binary catalog.

Every URL and sha256 here was verified live on 2026-06-11. Downloads are
ONLY ever made from these pinned entries (no user-supplied URLs in v1).
"""

from __future__ import annotations

import platform
import sys
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class LocalModelSpec:
    id: str
    label: str
    url: str
    sha256: str
    size_bytes: int
    min_ram_gb: int
    description: str


# CRITICAL: keep ascending by min_ram_gb - best_fit() relies on this order.
CATALOG: tuple[LocalModelSpec, ...] = (
    LocalModelSpec(
        id="llama3.2-3b-instruct-q4",
        label="Llama 3.2 3B Instruct",
        url=(
            "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/"
            "resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
        ),
        sha256="6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff",
        size_bytes=2019377696,
        min_ram_gb=8,
        description="Fast and light. Good for quick answers on 8 GB machines.",
    ),
    LocalModelSpec(
        id="qwen2.5-7b-instruct-q4",
        label="Qwen 2.5 7B Instruct",
        url=(
            "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/"
            "resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf"
        ),
        sha256="65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423",
        size_bytes=4683074240,
        min_ram_gb=16,
        description="Balanced quality and speed. Recommended for 16 GB machines.",
    ),
    LocalModelSpec(
        id="qwen2.5-14b-instruct-q4",
        label="Qwen 2.5 14B Instruct",
        url=(
            "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/"
            "resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf"
        ),
        sha256="e47ad95dad6ff848b431053b375adb5d39321290ea2c638682577dafca87c008",
        size_bytes=8988110976,
        min_ram_gb=32,
        description="Highest quality tier. Needs a 32 GB machine.",
    ),
)


def get_spec(model_id: str) -> Optional[LocalModelSpec]:
    for spec in CATALOG:
        if spec.id == model_id:
            return spec
    return None


def best_fit(detected_ram_gb: float) -> Optional[LocalModelSpec]:
    """Largest tier whose min_ram_gb is <= detected_ram_gb (inclusive). None if no tier fits."""
    fit = None
    for spec in CATALOG:
        if detected_ram_gb >= spec.min_ram_gb:
            fit = spec
    return fit


# --- llama-server prebuilt binaries (llama.cpp release b9592) ---------------

LLAMA_CPP_TAG = "b9592"


@dataclass(frozen=True)
class ServerBinarySpec:
    url: str
    sha256: str
    size_bytes: int
    archive_format: str  # "tar.gz" | "zip"
    server_member: str  # path of the server binary inside the archive


_RELEASE = f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_CPP_TAG}"

SERVER_BINARIES: dict[str, ServerBinarySpec] = {
    "darwin-arm64": ServerBinarySpec(
        url=f"{_RELEASE}/llama-{LLAMA_CPP_TAG}-bin-macos-arm64.tar.gz",
        sha256="e395d9f746bc1b04e3e019295e76a5158de3ecc837a2f08b7fe6e76ec5b42729",
        size_bytes=10548003,
        archive_format="tar.gz",
        server_member=f"llama-{LLAMA_CPP_TAG}/llama-server",
    ),
    "linux-x86_64": ServerBinarySpec(
        url=f"{_RELEASE}/llama-{LLAMA_CPP_TAG}-bin-ubuntu-x64.tar.gz",
        sha256="ce07450c3463473721843772fbbe4ea6c1691e097e4991e93239a1dda0dfa440",
        size_bytes=15408227,
        archive_format="tar.gz",
        server_member=f"llama-{LLAMA_CPP_TAG}/llama-server",
    ),
    "windows-x86_64": ServerBinarySpec(
        url=f"{_RELEASE}/llama-{LLAMA_CPP_TAG}-bin-win-cpu-x64.zip",
        sha256="2b3d4e167be290bf6266d405746da52813c19a58fe02dc88a97ab75c4c021428",
        size_bytes=16722005,
        archive_format="zip",
        server_member="llama-server.exe",
    ),
}


def _platform_key() -> str:
    machine = platform.machine().lower()
    arch = "arm64" if machine in ("arm64", "aarch64") else "x86_64"
    if sys.platform == "darwin":
        return f"darwin-{arch}"
    if sys.platform.startswith("linux"):
        return f"linux-{arch}"
    if sys.platform in ("win32", "cygwin"):
        return f"windows-{arch}"
    return f"{sys.platform}-{arch}"


def server_binary_spec() -> Optional[ServerBinarySpec]:
    """Spec for this platform, or None (Local group hidden in the picker)."""
    return SERVER_BINARIES.get(_platform_key())
