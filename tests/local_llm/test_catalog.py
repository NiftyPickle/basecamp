from hermes_cli.local_llm import catalog


def test_catalog_has_three_ascending_tiers():
    assert [s.min_ram_gb for s in catalog.CATALOG] == [8, 16, 32]
    assert all(s.url.startswith("https://huggingface.co/") for s in catalog.CATALOG)
    assert all(len(s.sha256) == 64 for s in catalog.CATALOG)


def test_get_spec():
    assert catalog.get_spec("qwen2.5-7b-instruct-q4").min_ram_gb == 16
    assert catalog.get_spec("nope") is None


def test_best_fit_boundaries():
    assert catalog.best_fit(7.9) is None
    assert catalog.best_fit(8.0).id == "llama3.2-3b-instruct-q4"
    assert catalog.best_fit(16.0).id == "qwen2.5-7b-instruct-q4"
    assert catalog.best_fit(31.9).id == "qwen2.5-7b-instruct-q4"
    assert catalog.best_fit(64.0).id == "qwen2.5-14b-instruct-q4"


def test_server_binary_spec_per_platform(monkeypatch):
    monkeypatch.setattr(catalog, "_platform_key", lambda: "darwin-arm64")
    spec = catalog.server_binary_spec()
    assert spec.archive_format == "tar.gz"
    assert spec.server_member == f"llama-{catalog.LLAMA_CPP_TAG}/llama-server"

    monkeypatch.setattr(catalog, "_platform_key", lambda: "windows-x86_64")
    spec = catalog.server_binary_spec()
    assert spec.archive_format == "zip"
    assert spec.server_member == "llama-server.exe"

    monkeypatch.setattr(catalog, "_platform_key", lambda: "linux-riscv")
    assert catalog.server_binary_spec() is None
