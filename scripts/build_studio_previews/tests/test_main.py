import os
import sys
import tempfile

import pytest

from build_studio_previews.__main__ import _filter_effects
from build_studio_previews.catalog import EffectSpec
from build_studio_previews.main import build_previews, ext_for_mode, media_type_for_mode

_BIG_VIDEO = b"v" * (3 * 1024 * 1024 + 1)


def _spec(key, name, mode):
    return EffectSpec(key, name, mode, f"https://demo.example/{key}.mp4")


def test_ext_for_mode_maps_ai_to_mp4_and_image_to_jpg():
    assert ext_for_mode("ai") == "mp4"
    assert ext_for_mode("image") == "jpg"


def test_media_type_for_mode_maps_ai_to_video_and_image_to_image():
    assert media_type_for_mode("ai") == "video"
    assert media_type_for_mode("image") == "image"


def test_mode_mapping_rejects_unknown_mode():
    with pytest.raises(ValueError):
        ext_for_mode("wan")
    with pytest.raises(ValueError):
        media_type_for_mode("wan")


def test_build_previews_fills_pending_and_skips_done():
    effects = [
        _spec("cakeify", "Cakeify", "ai"),
        _spec("glass-ball", "Glass Ball", "image"),
    ]
    fetched = []

    def fake_fetch(url):
        fetched.append(url)
        return b"demo-bytes"

    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "studio-previews.json")
        previews_dir = os.path.join(d, "studio-previews")
        # pre-seed cakeify as done
        from build_studio_previews.manifest import save_manifest
        save_manifest(
            path, {"cakeify": {"url": "/studio-previews/cakeify.mp4", "mediaType": "video"}}
        )

        result = build_previews(
            effects=effects, manifest_path=path, previews_dir=previews_dir,
            fetch=fake_fetch, reencode=lambda data: pytest.fail("must not reencode"),
        )

        assert fetched == ["https://demo.example/glass-ball.mp4"]
        assert result["glass-ball"] == {
            "url": "/studio-previews/glass-ball.jpg", "mediaType": "image",
        }
        assert result["cakeify"]["url"] == "/studio-previews/cakeify.mp4"  # preserved
        with open(os.path.join(previews_dir, "glass-ball.jpg"), "rb") as f:
            assert f.read() == b"demo-bytes"


def test_build_previews_reencodes_oversized_video_only():
    effects = [_spec("cakeify", "Cakeify", "ai")]

    def fake_reencode(data):
        assert data == _BIG_VIDEO
        return b"small-video"

    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "studio-previews.json")
        previews_dir = os.path.join(d, "studio-previews")
        result = build_previews(
            effects=effects, manifest_path=path, previews_dir=previews_dir,
            fetch=lambda url: _BIG_VIDEO, reencode=fake_reencode,
        )

        assert result["cakeify"] == {
            "url": "/studio-previews/cakeify.mp4", "mediaType": "video",
        }
        with open(os.path.join(previews_dir, "cakeify.mp4"), "rb") as f:
            assert f.read() == b"small-video"


def test_build_previews_does_not_reencode_oversized_image():
    effects = [_spec("glass-ball", "Glass Ball", "image")]

    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "studio-previews.json")
        previews_dir = os.path.join(d, "studio-previews")
        build_previews(
            effects=effects, manifest_path=path, previews_dir=previews_dir,
            fetch=lambda url: _BIG_VIDEO,
            reencode=lambda data: pytest.fail("images must not be re-encoded"),
        )
        size = os.path.getsize(os.path.join(previews_dir, "glass-ball.jpg"))
        assert size == len(_BIG_VIDEO)


def test_build_previews_skips_fetch_when_preview_file_exists():
    effects = [_spec("cakeify", "Cakeify", "ai")]

    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "studio-previews.json")
        previews_dir = os.path.join(d, "studio-previews")
        from build_studio_previews.local_store import write_preview
        write_preview(previews_dir, "cakeify", "mp4", b"cached-bytes")

        result = build_previews(
            effects=effects, manifest_path=path, previews_dir=previews_dir,
            fetch=lambda url: pytest.fail("must not download when preview exists"),
            reencode=lambda data: pytest.fail("must not reencode"),
        )

        assert result["cakeify"] == {
            "url": "/studio-previews/cakeify.mp4", "mediaType": "video",
        }


def test_build_previews_checkpoints_first_success_before_later_failure():
    effects = [
        _spec("cakeify", "Cakeify", "ai"),
        _spec("glass-ball", "Glass Ball", "image"),
    ]

    def fake_fetch(url):
        if "glass-ball" in url:
            raise RuntimeError("download outage")
        return b"demo-bytes"

    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "studio-previews.json")
        previews_dir = os.path.join(d, "studio-previews")
        with pytest.raises(RuntimeError, match="download outage"):
            build_previews(
                effects=effects, manifest_path=path, previews_dir=previews_dir,
                fetch=fake_fetch, reencode=lambda data: data,
            )
        from build_studio_previews.manifest import load_manifest
        on_disk = load_manifest(path)

    assert on_disk == {
        "cakeify": {"url": "/studio-previews/cakeify.mp4", "mediaType": "video"},
    }


def test_filter_effects_none_returns_all():
    effects = [
        _spec("cakeify", "Cakeify", "ai"),
        _spec("glass-ball", "Glass Ball", "image"),
    ]
    assert _filter_effects(effects, None) == effects


def test_filter_effects_selects_listed_keys():
    effects = [
        _spec("cakeify", "Cakeify", "ai"),
        _spec("glass-ball", "Glass Ball", "image"),
        _spec("baby-it", "Baby It", "ai"),
    ]
    out = _filter_effects(effects, "cakeify,baby-it")
    assert [e.key for e in out] == ["cakeify", "baby-it"]


def test_filter_effects_unknown_key_raises_with_valid_keys():
    effects = [_spec("cakeify", "Cakeify", "ai")]
    with pytest.raises(RuntimeError) as exc:
        _filter_effects(effects, "nope")
    assert "nope" in str(exc.value)
    assert "cakeify" in str(exc.value)


def test_filter_effects_dedupes_repeated_keys():
    effects = [
        _spec("cakeify", "Cakeify", "ai"),
        _spec("glass-ball", "Glass Ball", "image"),
    ]
    out = _filter_effects(effects, "cakeify,cakeify,glass-ball,cakeify")
    assert [e.key for e in out] == ["cakeify", "glass-ball"]


def _arm_cli(monkeypatch, out_path, previews_dir):
    """Point main() at a temp manifest + previews dir; ban build_previews."""
    import build_studio_previews.__main__ as cli

    monkeypatch.setattr(
        sys, "argv",
        ["build_studio_previews", "--out", out_path, "--previews-dir", previews_dir],
    )
    monkeypatch.setattr(
        cli, "build_previews",
        lambda **kwargs: pytest.fail("build_previews must not run when preflight fails"),
    )
    return cli


def test_main_preflight_missing_ffmpeg_exits_nonzero(monkeypatch, capsys):
    with tempfile.TemporaryDirectory() as d:
        cli = _arm_cli(
            monkeypatch, os.path.join(d, "out.json"), os.path.join(d, "studio-previews")
        )
        monkeypatch.setattr(cli.shutil, "which", lambda binary: None)
        rc = cli.main()
    assert rc != 0
    assert "ffmpeg" in capsys.readouterr().err


def test_main_preflight_unwritable_previews_dir_exits_nonzero(monkeypatch, capsys):
    with tempfile.TemporaryDirectory() as d:
        readonly = os.path.join(d, "readonly")
        os.makedirs(readonly)
        os.chmod(readonly, 0o500)  # r-x: makedirs/write inside must fail
        previews_dir = os.path.join(readonly, "studio-previews")
        try:
            cli = _arm_cli(monkeypatch, os.path.join(d, "out.json"), previews_dir)
            monkeypatch.setattr(cli.shutil, "which", lambda binary: "/usr/bin/ffmpeg")
            rc = cli.main()
        finally:
            os.chmod(readonly, 0o700)  # let TemporaryDirectory clean up
    assert rc != 0
    assert "studio-previews" in capsys.readouterr().err


def test_main_preflight_rejects_previews_dir_with_wrong_basename(monkeypatch, capsys):
    with tempfile.TemporaryDirectory() as d:
        cli = _arm_cli(monkeypatch, os.path.join(d, "out.json"), os.path.join(d, "elsewhere"))
        monkeypatch.setattr(cli.shutil, "which", lambda binary: "/usr/bin/ffmpeg")
        rc = cli.main()
    assert rc != 0
    assert "studio-previews" in capsys.readouterr().err


def test_main_preflight_probe_leaves_dir_but_no_probe_file(monkeypatch):
    import build_studio_previews.__main__ as cli

    with tempfile.TemporaryDirectory() as d:
        previews_dir = os.path.join(d, "studio-previews")
        cli._probe_writable(previews_dir)
        assert os.path.isdir(previews_dir)
        assert os.listdir(previews_dir) == []  # probe file cleaned up
