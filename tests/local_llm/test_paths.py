from pathlib import Path

from hermes_cli.local_llm import paths


def test_root_defaults_to_hermes_home(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    assert paths.local_llm_root() == tmp_path / "local-llm"


def test_root_falls_back_to_home_dot_hermes(monkeypatch, tmp_path):
    monkeypatch.delenv("HERMES_HOME", raising=False)
    monkeypatch.setattr(Path, "home", staticmethod(lambda: tmp_path))
    assert paths.local_llm_root() == tmp_path / ".hermes" / "local-llm"


def test_model_path_is_under_models_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    assert paths.model_path("qwen2.5-7b-instruct-q4") == (
        tmp_path / "local-llm" / "models" / "qwen2.5-7b-instruct-q4.gguf"
    )


def test_bin_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    assert paths.bin_dir() == tmp_path / "local-llm" / "bin"
