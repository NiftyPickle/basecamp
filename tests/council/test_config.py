from hermes_cli.council import config


def test_default_models_are_four_distinct_strong_slugs():
    models = config.COUNCIL_DEFAULT_MODELS
    assert len(models) == 4
    assert len(set(models)) == 4
    assert "anthropic/claude-sonnet-4.5" in models
    assert "openai/gpt-5.1" in models
    assert "google/gemini-2.5-pro" in models
    assert "deepseek/deepseek-chat-v3-0324" in models


def test_synthesizer_and_floors():
    assert config.COUNCIL_SYNTHESIZER == "anthropic/claude-sonnet-4.5"
    assert config.COUNCIL_MIN_SURVIVORS == 2
    assert config.COUNCIL_MEMBER_TIMEOUT > 0
    assert config.FREE_CHAT_DEFAULT_MODEL.endswith(":free")


def test_critique_prompt_includes_peer_answers():
    prompt = config.build_critique_prompt(
        question="What is 2+2?",
        own_answer="4",
        peer_answers=[("openai/gpt-5.1", "four"), ("google/gemini-2.5-pro", "4.0")],
    )
    assert "What is 2+2?" in prompt
    assert "four" in prompt
    assert "4.0" in prompt


def test_synthesis_prompt_includes_answers_and_critiques():
    prompt = config.build_synthesis_prompt(
        question="Q",
        members=[
            {"model": "a", "answer": "ans-a", "critique": "crit-a", "ok": True},
            {"model": "b", "answer": "ans-b", "critique": None, "ok": True},
        ],
    )
    assert "ans-a" in prompt and "ans-b" in prompt
    assert "crit-a" in prompt
    # verdict structure cues present
    assert "consensus" in prompt.lower()
    assert "confidence" in prompt.lower()
