from hermes_cli.council import config
from hermes_cli.council.info import build_openrouter_info


def test_key_absent_gates_everything():
    info = build_openrouter_info(
        key_checker=lambda: False,
        free_models_provider=lambda: ["meta-llama/llama-3.3-70b-instruct:free"],
    )
    assert info["key_present"] is False
    assert info["council_available"] is False
    assert info["free_models"] == ["meta-llama/llama-3.3-70b-instruct:free"]
    assert info["council_default_models"] == config.COUNCIL_DEFAULT_MODELS


def test_key_present_enables_council():
    info = build_openrouter_info(
        key_checker=lambda: True,
        free_models_provider=lambda: [],
    )
    assert info["key_present"] is True
    # one OpenRouter key routes all member slugs -> council available
    assert info["council_available"] is True


def test_never_leaks_key_material():
    info = build_openrouter_info(
        key_checker=lambda: True,
        free_models_provider=lambda: [],
    )
    blob = repr(info)
    assert "sk-or-v1" not in blob
    assert "OPENROUTER_API_KEY" not in blob
    # only the documented keys are present
    assert set(info.keys()) == {
        "key_present",
        "free_models",
        "council_available",
        "council_default_models",
    }
