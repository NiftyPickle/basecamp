import pytest

from hermes_cli.studio.lipsync_models import (
    LIPSYNC_MODELS,
    build_lipsync_payload,
)


def test_registry_has_exactly_four_models():
    assert set(LIPSYNC_MODELS) == {
        "latentsync-video",
        "creatify-lipsync",
        "ltx-2-19b-lipsync",
        "ltx-2.3-lipsync",
    }


def test_video_model_payload_includes_audio_and_video():
    payload = build_lipsync_payload(
        "latentsync-video",
        {"audio_url": "https://x/a.mp3", "video_url": "https://x/v.mp4"},
    )
    assert payload == {"audio_url": "https://x/a.mp3", "video_url": "https://x/v.mp4"}


def test_video_model_rejects_missing_video_url():
    with pytest.raises(ValueError, match="video_url"):
        build_lipsync_payload("creatify-lipsync", {"audio_url": "https://x/a.mp3"})


def test_ltx_model_defaults_resolution_and_drops_empty_optionals():
    payload = build_lipsync_payload(
        "ltx-2-19b-lipsync", {"audio_url": "https://x/a.mp3"}
    )
    assert payload == {"audio_url": "https://x/a.mp3", "resolution": "720p"}


def test_ltx_model_passes_optionals():
    payload = build_lipsync_payload(
        "ltx-2.3-lipsync",
        {
            "audio_url": "https://x/a.mp3",
            "image_url": "https://x/i.png",
            "prompt": "talking head",
            "resolution": "1080p",
            "seed": 42,
        },
    )
    assert payload == {
        "audio_url": "https://x/a.mp3",
        "image_url": "https://x/i.png",
        "prompt": "talking head",
        "resolution": "1080p",
        "seed": 42,
    }


def test_ltx_model_rejects_bad_resolution():
    with pytest.raises(ValueError, match="resolution"):
        build_lipsync_payload(
            "ltx-2-19b-lipsync",
            {"audio_url": "https://x/a.mp3", "resolution": "4K"},
        )


def test_video_model_rejects_ltx_only_fields():
    with pytest.raises(ValueError, match="image_url"):
        build_lipsync_payload(
            "latentsync-video",
            {
                "audio_url": "https://x/a.mp3",
                "video_url": "https://x/v.mp4",
                "image_url": "https://x/i.png",
            },
        )


def test_unknown_model_rejected():
    with pytest.raises(ValueError, match="unknown lipsync model"):
        build_lipsync_payload("wav2lip", {"audio_url": "https://x/a.mp3"})


def test_ltx_2_19b_rejects_seed():
    with pytest.raises(ValueError, match="seed"):
        build_lipsync_payload(
            "ltx-2-19b-lipsync",
            {"audio_url": "https://x/a.mp3", "seed": 7},
        )


def test_audio_model_rejects_video_url():
    with pytest.raises(ValueError, match="video_url"):
        build_lipsync_payload(
            "ltx-2-19b-lipsync",
            {"audio_url": "https://x/a.mp3", "video_url": "https://x/v.mp4"},
        )


def test_audio_model_rejects_non_http_image_url():
    with pytest.raises(ValueError, match="image_url"):
        build_lipsync_payload(
            "ltx-2.3-lipsync",
            {"audio_url": "https://x/a.mp3", "image_url": "ftp://x/i.png"},
        )


def test_ltx_model_rejects_non_integer_seed():
    with pytest.raises(ValueError, match="seed must be an integer"):
        build_lipsync_payload(
            "ltx-2.3-lipsync",
            {"audio_url": "https://x/a.mp3", "seed": "abc"},
        )
