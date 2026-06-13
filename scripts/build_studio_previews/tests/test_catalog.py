import dataclasses
import re
from pathlib import Path

import pytest

from build_studio_previews.catalog import EFFECTS, EffectSpec

_REPO_ROOT = Path(__file__).resolve().parents[3]
_TS_CATALOG = _REPO_ROOT / "web" / "src" / "lib" / "studio-effects.ts"

# Matches the two grouped const arrays in studio-effects.ts:
#   const AI_EFFECTS: Array<[string, string]> = [ ["cakeify", "Cakeify"], ... ];
_GROUP_RE = re.compile(
    r"const\s+(AI|IMAGE)_EFFECTS\s*:\s*Array<\[string,\s*string\]>\s*=\s*\[(.*?)\];",
    re.DOTALL,
)
_PAIR_RE = re.compile(r'\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]')

_EXPECTED_KEYS = {
    # mode "ai" (cinematic 9-pack, phase 5)
    "film-noir",
    "vhs-footage",
    "cyberpunk-2077",
    "assassin-it",
    "samurai-it",
    "robotic-face-reveal",
    "fire",
    "tsunami",
    "pov-driving",
    # mode "image"
    "angel-figurine",
    "glass-ball",
    "felt-keychain",
    "plastic-bubble-figure",
    "american-comic-style",
}


def test_every_effect_has_key_name_mode_and_demo_url():
    for e in EFFECTS:
        assert e.key
        assert e.name
        assert e.mode in {"ai", "image"}
        assert e.demo_url
        assert e.demo_url.startswith("https://")


def test_modes_limited_to_ai_and_image():
    assert {e.mode for e in EFFECTS} == {"ai", "image"}


def test_catalog_has_nine_ai_and_five_image_effects():
    assert len([e for e in EFFECTS if e.mode == "ai"]) == 9
    assert len([e for e in EFFECTS if e.mode == "image"]) == 5


def test_catalog_keys_match_locked_set():
    assert {e.key for e in EFFECTS} == _EXPECTED_KEYS


def test_effect_keys_unique():
    keys = [e.key for e in EFFECTS]
    assert len(set(keys)) == len(keys)


def test_ai_demo_urls_are_mp4_and_image_demo_urls_are_jpg():
    for e in EFFECTS:
        if e.mode == "ai":
            assert e.demo_url.endswith(".mp4"), e.key
        else:
            assert e.demo_url.endswith(".jpg"), e.key


def test_catalog_matches_frontend_studio_effects_ts():
    source = _TS_CATALOG.read_text(encoding="utf-8")
    groups = _GROUP_RE.findall(source)
    assert len(groups) == 2, (
        f"expected AI/IMAGE effect groups in {_TS_CATALOG}, "
        f"found {len(groups)}; the TS format may have changed"
    )
    ts_entries = set()
    for group_name, body in groups:
        mode = group_name.lower()
        pairs = _PAIR_RE.findall(body)
        assert pairs, f"no (key, name) pairs extracted from {group_name}_EFFECTS"
        for key, name in pairs:
            ts_entries.add((key, name, mode))
    py_entries = {(e.key, e.name, e.mode) for e in EFFECTS}
    assert ts_entries == py_entries


def test_effectspec_is_immutable():
    with pytest.raises(dataclasses.FrozenInstanceError):
        EFFECTS[0].key = "mutated"  # type: ignore[misc]
