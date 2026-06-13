"""hf-dop-image-to-video motion catalog.

Exact enum values from the MUAPI OpenAPI HfDopVideoRequest schema. The
backend validates against this set; the frontend mirrors it in
web/src/lib/studio-motions.ts (parity locked by tests on both sides).
"""

from __future__ import annotations

HF_DOP_MOTIONS: tuple[str, ...] = (
    "360 Orbit", "3D Rotation", "Abstract", "Action Run", "Agent Reveal",
    "Angel Wings", "Arc Left", "Arc Right", "Baseball Kick", "Basketball Dunks",
    "Black Tears", "Bloom Mouth", "Boxing", "Buckle Up", "Building Explosion",
    "Bullet Time", "Car Chasing", "Car Explosion", "Car Grip", "Catwalk",
    "Clone Explosion", "Crane Down", "Crane Over The Head", "Crane Up",
    "Crash Zoom In", "Crash Zoom Out", "Datamosh", "Diamond", "Dirty Lens",
    "Disintegration", "Dolly In", "Dolly Left", "Dolly Out", "Dolly Right",
    "Dolly Zoom In", "Dolly Zoom Out", "Double Dolly", "Downhill POV",
    "Duplicate", "Dutch Angle", "Earth Zoom Out", "Eyes In", "Face Punch",
    "Fire Breathe", "Fisheye", "Floating Fish", "Flood", "Floral Eyes",
    "Flying", "Focus Change", "FPV Drone", "Freezing", "Garden Bloom",
    "General", "Glam", "Glowing Fish", "Glowshift", "Handheld",
    "Head Explosion", "Head Off", "Head Tracking", "Hyperlapse", "Incline",
    "Innerlight", "Invisible", "Jelly Drift", "Jib Down", "Jib Up", "Kiss",
    "Lazy Susan", "Lens Crack", "Lens Flare", "Levitation", "Low Shutter",
    "Medusa Gorgona", "Melting", "Moonwalk Left", "Moonwalk Right",
    "Morphskin", "Mouth In", "Object POV", "Overhead", "Paint Splash",
    "Paparazzi", "Powder Explosion", "Push To Glass", "Rap Flex", "Robo Arm",
    "Roll Transition", "Sand Storm", "Set on Fire", "Skateboard Glide",
    "Skateboard Ollie", "Skate Cruise", "Ski Carving", "Skin Surge",
    "Ski Powder", "Snorricam", "Snowboard Carving", "Snowboard Powder",
    "Soul Jump", "Static", "Super 8MM", "Super Dolly In", "Super Dolly Out",
    "Tentacles", "Through Object In", "Through Object Out", "Thunder God",
    "Tilt Down", "Tilt up", "Timelapse Human", "Timelapse Landscape",
    "Turning Metal", "VHS", "Whip Pan", "Wiggle", "Wind to Face",
    "YoYo Zoom", "Zoom In", "Zoom Out",
)

HF_DOP_MOTION_SET = frozenset(HF_DOP_MOTIONS)

HF_DOP_OPTIONS: tuple[str, ...] = ("dop-lite", "dop-turbo", "dop-preview")
HF_DOP_DEFAULT_OPTION = "dop-lite"
