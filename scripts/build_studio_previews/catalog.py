"""Effect catalog mirror for the preview builder.

Mirrors the frontend starter set in web/src/lib/studio-effects.ts. Kept in sync
by hand; both are small. Each effect carries a rights-clean public demo URL
(Remade-AI HuggingFace repos, Apache 2.0; muapi public CDN jpgs) downloaded
instead of running billed generation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

EffectMode = Literal["ai", "image"]

_HF = "https://huggingface.co"
_CDN = "https://d3adwkbyhxyrtq.cloudfront.net/webassets/ai_effects"


@dataclass(frozen=True)
class EffectSpec:
    key: str
    name: str
    mode: EffectMode
    demo_url: str


# ai-video-effects endpoint: image in -> video out. Demos are the example clips
# published in the Remade-AI HuggingFace repos (Apache 2.0). Cinematic 9-pack
# (phase 5); wire values are display names, pending live enum verification.
_AI = [
    ("film-noir", "Film Noir",
     f"{_HF}/Remade-AI/Film-Noir/resolve/main/example_videos/1.mp4"),
    ("vhs-footage", "VHS Footage",
     f"{_HF}/Remade-AI/Vintage-VHS/resolve/main/example_videos/1.mp4"),
    ("cyberpunk-2077", "Cyberpunk 2077",
     f"{_HF}/Remade-AI/Cyberpunk/resolve/main/example_videos/1.mp4"),
    ("assassin-it", "Assassin It",
     f"{_HF}/Remade-AI/Assassin/resolve/main/example_videos/dog_assassin.mp4"),
    ("samurai-it", "Samurai It",
     f"{_HF}/Remade-AI/Samurai/resolve/main/example_videos/rabbit_samurai.mp4"),
    ("robotic-face-reveal", "Robotic Face Reveal",
     f"{_HF}/Remade-AI/Robot-Face-Reveal/resolve/main/example_videos/robot1.mp4"),
    ("fire", "Fire",
     f"{_HF}/Remade-AI/Fire/resolve/main/example_videos/fire1.mp4"),
    ("tsunami", "Tsunami",
     f"{_HF}/Remade-AI/Tsunami/resolve/main/example_videos/tsunami1.mp4"),
    ("pov-driving", "POV Driving",
     f"{_HF}/Remade-AI/POV-Driving/resolve/main/example_videos/pov1.mp4"),
]

# image-effects endpoint: image in -> image out. Demos are muapi's public
# web-asset jpgs for the same enum values.
_IMAGE = [
    ("angel-figurine", "Angel Figurine", f"{_CDN}/angel-figurine.jpg"),
    ("glass-ball", "Glass Ball", f"{_CDN}/glass-ball.jpg"),
    ("felt-keychain", "Felt Keychain", f"{_CDN}/felt-keychain.jpg"),
    ("plastic-bubble-figure", "Plastic Bubble Figure", f"{_CDN}/plastic-bubble-figure.jpg"),
    ("american-comic-style", "American Comic Style", f"{_CDN}/american-comic-style.jpg"),
]

EFFECTS: list[EffectSpec] = (
    [EffectSpec(k, n, "ai", u) for k, n, u in _AI]
    + [EffectSpec(k, n, "image", u) for k, n, u in _IMAGE]
)
