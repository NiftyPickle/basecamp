import os
import tempfile

import pytest

from build_studio_previews.local_store import (
    existing_preview,
    preview_filename,
    preview_url,
    write_preview,
)


def test_preview_filename_joins_key_and_ext():
    assert preview_filename("explode", "mp4") == "explode.mp4"
    assert preview_filename("plushie", "png") == "plushie.png"


def test_preview_url_format():
    assert preview_url("explode", "mp4") == "/studio-previews/explode.mp4"
    assert preview_url("plushie", "png") == "/studio-previews/plushie.png"


def test_write_preview_returns_url_and_writes_exact_bytes():
    data = b"\x00\x01binary-video-bytes\xff"
    with tempfile.TemporaryDirectory() as d:
        previews_dir = os.path.join(d, "studio-previews")  # not pre-created
        url = write_preview(previews_dir, "explode", "mp4", data)

        assert url == "/studio-previews/explode.mp4"
        path = os.path.join(previews_dir, "explode.mp4")
        with open(path, "rb") as f:
            assert f.read() == data
        # atomic write leaves no .tmp residue
        assert os.listdir(previews_dir) == ["explode.mp4"]


def test_write_preview_overwrites_existing_file():
    with tempfile.TemporaryDirectory() as d:
        write_preview(d, "explode", "mp4", b"old")
        write_preview(d, "explode", "mp4", b"new")
        with open(os.path.join(d, "explode.mp4"), "rb") as f:
            assert f.read() == b"new"


def test_write_preview_empty_data_raises():
    with tempfile.TemporaryDirectory() as d:
        with pytest.raises(ValueError, match="explode"):
            write_preview(d, "explode", "mp4", b"")
        assert os.listdir(d) == []  # nothing written


def test_existing_preview_none_for_missing_file():
    with tempfile.TemporaryDirectory() as d:
        assert existing_preview(d, "explode", "mp4") is None


def test_existing_preview_none_for_empty_file():
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "explode.mp4"), "wb").close()
        assert existing_preview(d, "explode", "mp4") is None


def test_existing_preview_url_for_nonempty_file():
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "explode.mp4"), "wb") as f:
            f.write(b"bytes")
        assert existing_preview(d, "explode", "mp4") == "/studio-previews/explode.mp4"
