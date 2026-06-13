import pytest

from hermes_cli.local_llm import catalog, paths, runtime
from hermes_cli.local_llm.errors import LocalLLMError


class FakeProc:
    def __init__(self, argv):
        self.argv = argv
        self.terminated = False
        self._exited = False

    def poll(self):
        return 1 if self._exited else None

    def terminate(self):
        self.terminated = True
        self._exited = True

    def wait(self, timeout=None):
        return 0


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    spec = catalog.server_binary_spec()
    assert spec is not None, "test host platform must be in SERVER_BINARIES"
    binary = paths.bin_dir() / spec.server_member
    binary.parent.mkdir(parents=True, exist_ok=True)
    binary.write_bytes(b"bin")
    paths.models_dir().mkdir(parents=True, exist_ok=True)
    paths.model_path("qwen2.5-7b-instruct-q4").write_bytes(b"gguf")
    paths.model_path("llama3.2-3b-instruct-q4").write_bytes(b"gguf")

    spawned = []

    def fake_spawn(argv):
        proc = FakeProc(argv)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(runtime, "_spawn", fake_spawn)
    monkeypatch.setattr(runtime, "_health_ok", lambda base_url: True)
    monkeypatch.setattr(runtime, "_sleep", lambda s: None)
    runtime.stop()
    yield spawned
    runtime.stop()


def test_ensure_running_starts_server_and_returns_base_url(env):
    base = runtime.ensure_running("qwen2.5-7b-instruct-q4")
    assert base.startswith("http://127.0.0.1:")
    assert len(env) == 1
    argv = env[0].argv
    assert "--host" in argv and argv[argv.index("--host") + 1] == "127.0.0.1"
    assert "-c" in argv and argv[argv.index("-c") + 1] == "4096"


def test_ensure_running_reuses_same_model(env):
    a = runtime.ensure_running("qwen2.5-7b-instruct-q4")
    b = runtime.ensure_running("qwen2.5-7b-instruct-q4")
    assert a == b
    assert len(env) == 1


def test_model_switch_restarts(env):
    runtime.ensure_running("qwen2.5-7b-instruct-q4")
    runtime.ensure_running("llama3.2-3b-instruct-q4")
    assert len(env) == 2
    assert env[0].terminated


def test_unknown_model_errors(env):
    with pytest.raises(LocalLLMError, match="unknown"):
        runtime.ensure_running("nope")


def test_missing_gguf_friendly_error(env, monkeypatch):
    paths.model_path("qwen2.5-7b-instruct-q4").unlink()
    with pytest.raises(LocalLLMError, match="not installed"):
        runtime.ensure_running("qwen2.5-7b-instruct-q4")


def test_server_never_healthy_terminates_and_errors(env, monkeypatch):
    monkeypatch.setattr(runtime, "_health_ok", lambda base_url: False)
    monkeypatch.setattr(runtime, "_STARTUP_TIMEOUT_S", 0.0)
    with pytest.raises(LocalLLMError, match="did not become ready"):
        runtime.ensure_running("qwen2.5-7b-instruct-q4")
    assert env[0].terminated


def test_current_model_and_stop(env):
    runtime.ensure_running("qwen2.5-7b-instruct-q4")
    assert runtime.current_model() == "qwen2.5-7b-instruct-q4"
    runtime.stop()
    assert runtime.current_model() is None
    assert env[0].terminated
