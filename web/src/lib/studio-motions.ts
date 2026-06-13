// hf-dop-image-to-video motion catalog. Wire values are exact MUAPI enum
// strings sent verbatim to the backend; grouping is display-only. Backend
// mirror: hermes_cli/studio/motions.py (121 values, parity locked by tests
// on both sides).

export type MotionGroup = { label: string; motions: string[] };

export const MOTION_GROUPS: MotionGroup[] = [
  {
    label: "Camera Moves",
    motions: [
      "360 Orbit", "Arc Left", "Arc Right", "Crane Down", "Crane Over The Head",
      "Crane Up", "Dolly In", "Dolly Left", "Dolly Out", "Dolly Right",
      "Double Dolly", "Downhill POV", "Dutch Angle", "FPV Drone", "General",
      "Handheld", "Head Tracking", "Incline", "Jib Down", "Jib Up",
      "Lazy Susan", "Object POV", "Overhead", "Roll Transition", "Snorricam",
      "Static", "Tilt Down", "Tilt up", "Whip Pan", "Wiggle",
    ],
  },
  {
    label: "Zooms and Dollies",
    motions: [
      "Crash Zoom In", "Crash Zoom Out", "Dolly Zoom In", "Dolly Zoom Out",
      "Earth Zoom Out", "Focus Change", "Push To Glass", "Super Dolly In",
      "Super Dolly Out", "Through Object In", "Through Object Out",
      "YoYo Zoom", "Zoom In", "Zoom Out",
    ],
  },
  {
    label: "Action",
    motions: [
      "Action Run", "Agent Reveal", "Baseball Kick", "Basketball Dunks",
      "Boxing", "Buckle Up", "Car Chasing", "Car Grip", "Catwalk",
      "Face Punch", "Flying", "Hyperlapse", "Kiss", "Levitation",
      "Moonwalk Left", "Moonwalk Right", "Rap Flex", "Skate Cruise",
      "Skateboard Glide", "Skateboard Ollie", "Ski Carving", "Ski Powder",
      "Snowboard Carving", "Snowboard Powder", "Timelapse Human",
      "Timelapse Landscape",
    ],
  },
  {
    label: "Effects",
    motions: [
      "3D Rotation", "Abstract", "Angel Wings", "Black Tears", "Bloom Mouth",
      "Building Explosion", "Bullet Time", "Car Explosion", "Clone Explosion",
      "Datamosh", "Diamond", "Disintegration", "Duplicate", "Eyes In",
      "Fire Breathe", "Floating Fish", "Flood", "Floral Eyes", "Freezing",
      "Garden Bloom", "Glam", "Glowing Fish", "Glowshift", "Head Explosion",
      "Head Off", "Innerlight", "Invisible", "Jelly Drift", "Medusa Gorgona",
      "Melting", "Morphskin", "Mouth In", "Paint Splash", "Paparazzi",
      "Powder Explosion", "Robo Arm", "Sand Storm", "Set on Fire",
      "Skin Surge", "Soul Jump", "Tentacles", "Thunder God", "Turning Metal",
      "Wind to Face",
    ],
  },
  {
    label: "Lens and Film",
    motions: [
      "Dirty Lens", "Fisheye", "Lens Crack", "Lens Flare", "Low Shutter",
      "Super 8MM", "VHS",
    ],
  },
];

export const ALL_MOTIONS: string[] = MOTION_GROUPS.flatMap((g) => g.motions);

export const DEFAULT_MOTION = "Bullet Time";

export const DOP_QUALITY_OPTIONS = [
  { value: "dop-lite", label: "Lite (default)" },
  { value: "dop-turbo", label: "Turbo" },
  { value: "dop-preview", label: "Preview" },
] as const;
