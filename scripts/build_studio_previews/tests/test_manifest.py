import json
import os
import tempfile

import pytest

from build_studio_previews.manifest import (
    load_manifest, save_manifest, merge_entry, pending_keys,
)
from build_studio_previews.catalog import EffectSpec


def test_load_missing_returns_empty():
    with tempfile.TemporaryDirectory() as d:
        assert load_manifest(os.path.join(d, "nope.json")) == {}


def test_merge_entry_is_immutable_and_adds():
    base = {"explode": {"url": "u1", "mediaType": "video"}}
    out = merge_entry(base, "plushie", "u2", "image")
    assert base == {"explode": {"url": "u1", "mediaType": "video"}}  # unchanged
    assert out["plushie"] == {"url": "u2", "mediaType": "image"}
    assert out["explode"] == {"url": "u1", "mediaType": "video"}


def test_save_then_load_roundtrips():
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "studio-previews.json")
        data = {"explode": {"url": "u", "mediaType": "video"}}
        save_manifest(path, data)
        assert load_manifest(path) == data
        # valid JSON on disk
        with open(path) as f:
            assert json.load(f) == data


def test_pending_keys_skips_done():
    effects = [
        EffectSpec("cakeify", "Cakeify", "ai", "https://demo.example/cakeify.mp4"),
        EffectSpec("glass-ball", "Glass Ball", "image", "https://demo.example/glass-ball.jpg"),
    ]
    manifest = {"cakeify": {"url": "u", "mediaType": "video"}}
    assert pending_keys(effects, manifest) == ["glass-ball"]


def test_save_is_atomic_and_leaves_no_tmp_file():
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "nested", "studio-previews.json")
        save_manifest(path, {"explode": {"url": "u", "mediaType": "video"}})
        assert os.path.exists(path)
        assert not os.path.exists(path + ".tmp")


def test_save_handles_bare_filename(monkeypatch):
    with tempfile.TemporaryDirectory() as d:
        monkeypatch.chdir(d)
        save_manifest("studio-previews.json", {"explode": {"url": "u", "mediaType": "video"}})
        assert load_manifest("studio-previews.json") == {"explode": {"url": "u", "mediaType": "video"}}


def test_load_corrupt_json_moves_file_aside_and_returns_empty(caplog):
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "studio-previews.json")
        with open(path, "w") as f:
            f.write("{not json")
        with caplog.at_level("WARNING"):
            assert load_manifest(path) == {}
        assert not os.path.exists(path)
        with open(path + ".corrupt") as f:
            assert f.read() == "{not json"
        assert any(path in rec.getMessage() for rec in caplog.records)


def test_load_non_dict_json_moves_file_aside_and_returns_empty(caplog):
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "studio-previews.json")
        with open(path, "w") as f:
            f.write("[1, 2]")
        with caplog.at_level("WARNING"):
            assert load_manifest(path) == {}
        assert not os.path.exists(path)
        with open(path + ".corrupt") as f:
            assert f.read() == "[1, 2]"


def test_load_oserror_warns_and_returns_empty_without_rename(caplog, monkeypatch):
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "studio-previews.json")
        with open(path, "w") as f:
            f.write("{}")

        def boom(*args, **kwargs):
            raise OSError("permission denied")

        monkeypatch.setattr("builtins.open", boom)
        with caplog.at_level("WARNING"):
            assert load_manifest(path) == {}
        assert os.path.exists(path)
        assert not os.path.exists(path + ".corrupt")


def test_merge_entry_rejects_invalid_media_type():
    with pytest.raises(ValueError):
        merge_entry({}, "explode", "https://cdn/x", "gif")
