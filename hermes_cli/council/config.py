"""Council Mode configuration constants and prompt builders.

Model slugs verified live against the OpenRouter models API on 2026-06-11.
Council is a quality feature: the default members are strong cross-lab models
chosen for answer diversity, not cost. Free chat is the separate zero-spend path.
"""

from __future__ import annotations

# Strong, cross-lab council members (paid expected). Diversity is the point.
COUNCIL_DEFAULT_MODELS: list[str] = [
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-5.1",
    "google/gemini-2.5-pro",
    "deepseek/deepseek-chat-v3-0324",
]

# The model that writes the final verdict.
COUNCIL_SYNTHESIZER: str = "anthropic/claude-sonnet-4.5"

# Per-member call timeout in seconds.
COUNCIL_MEMBER_TIMEOUT: float = 90.0

# Minimum members that must survive round 1 to produce a verdict.
COUNCIL_MIN_SURVIVORS: int = 2

# Single model used by a non-council Free chat turn. Free slugs rotate;
# /api/openrouter/info exposes the live list and the picker can override.
FREE_CHAT_DEFAULT_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"


def build_critique_prompt(
    question: str,
    own_answer: str,
    peer_answers: list[tuple[str, str]],
) -> str:
    """Round-2 prompt: ask a member to critique peers and refine its answer."""
    peer_block = "\n\n".join(
        f"[{label}]\n{answer}" for label, answer in peer_answers
    )
    return (
        "You are one member of an expert council answering a user's question.\n"
        f"Question:\n{question}\n\n"
        f"Your initial answer:\n{own_answer}\n\n"
        "Other members' answers:\n"
        f"{peer_block}\n\n"
        "Critique the other answers, note where you agree or disagree and why, "
        "and give your refined final answer. Be concise and specific."
    )


def build_synthesis_prompt(
    question: str,
    members: list[dict],
) -> str:
    """Final prompt: synthesizer produces the council verdict."""
    blocks = []
    for m in members:
        if not m.get("ok"):
            continue
        crit = m.get("critique")
        crit_line = f"\nCritique: {crit}" if crit else ""
        blocks.append(f"[{m['model']}]\nAnswer: {m['answer']}{crit_line}")
    body = "\n\n".join(blocks)
    return (
        "You are the chair synthesizing an expert council's deliberation into a "
        "single verdict for the user.\n"
        f"Question:\n{question}\n\n"
        "Council members (answers and critiques):\n"
        f"{body}\n\n"
        "Write the verdict with these parts:\n"
        "- Consensus: what the members agree on.\n"
        "- Divergence: where they disagree, and which view is stronger.\n"
        "- Recommendation: the single best answer to give the user.\n"
        "- Confidence: low / medium / high, with one line of justification."
    )
