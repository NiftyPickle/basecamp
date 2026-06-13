// Static effect + enhance catalog. Effect wire values and enhance op ids are
// verified against the real muapi enums; the backend sends `effect` through
// verbatim, so wire values must match exactly (spaces included).

// EffectMode's single source of truth is studio-api; re-exported here so
// catalog consumers can keep importing it alongside the effect entries.
import type { EffectMode } from "./studio-api";

export type { EffectMode } from "./studio-api";

export type EffectEntry = {
  /** Filename-safe slug; used for preview manifest and local store lookups. */
  key: string;
  /** Display name shown on the card. */
  name: string;
  /** Exact muapi enum value sent to the backend as `effect`. */
  wire: string;
  /** Both modes take a source image; "ai" outputs video, "image" outputs image. */
  mode: EffectMode;
};

export type EnhanceOp = {
  id: string;
  label: string;
  /** Input fields the op needs. Single-image ops use ["image"]. */
  inputs: readonly ["image"] | readonly ["source", "target"];
  accept: string;
};

// Curated effect set, grouped by mode. wire currently equals the display name
// for every effect; the field stays separate so a future label rename cannot
// silently break the API call.

// ai-video-effects endpoint: image in -> video out. Cinematic 9-pack (phase 5).
// wire = display name per the existing convention; pending live enum
// verification before the first billed run (see plan 5.5 open risk).
const AI_EFFECTS: Array<[string, string]> = [
  ["film-noir", "Film Noir"],
  ["vhs-footage", "VHS Footage"],
  ["cyberpunk-2077", "Cyberpunk 2077"],
  ["assassin-it", "Assassin It"],
  ["samurai-it", "Samurai It"],
  ["robotic-face-reveal", "Robotic Face Reveal"],
  ["fire", "Fire"],
  ["tsunami", "Tsunami"],
  ["pov-driving", "POV Driving"],
];
// image-effects endpoint: image in -> image out.
const IMAGE_EFFECTS: Array<[string, string]> = [
  ["angel-figurine", "Angel Figurine"],
  ["glass-ball", "Glass Ball"],
  ["felt-keychain", "Felt Keychain"],
  ["plastic-bubble-figure", "Plastic Bubble Figure"],
  ["american-comic-style", "American Comic Style"],
];

function build(pairs: Array<[string, string]>, mode: EffectMode): EffectEntry[] {
  return pairs.map(([key, name]) => ({ key, name, wire: name, mode }));
}

export const EFFECTS: EffectEntry[] = [
  ...build(AI_EFFECTS, "ai"),
  ...build(IMAGE_EFFECTS, "image"),
];

export function effectsForMode(mode: EffectMode): EffectEntry[] {
  return EFFECTS.filter((e) => e.mode === mode);
}

const IMAGE_ACCEPT = "image/*";

export const ENHANCE_OPS: EnhanceOp[] = [
  { id: "upscale", label: "Upscale", inputs: ["image"], accept: IMAGE_ACCEPT },
  { id: "bg-remove", label: "Remove background", inputs: ["image"], accept: IMAGE_ACCEPT },
  { id: "skin", label: "Skin retouch", inputs: ["image"], accept: IMAGE_ACCEPT },
  { id: "colorize", label: "Colorize", inputs: ["image"], accept: IMAGE_ACCEPT },
  { id: "ghibli", label: "Ghibli style", inputs: ["image"], accept: IMAGE_ACCEPT },
  { id: "anime", label: "Anime style", inputs: ["image"], accept: IMAGE_ACCEPT },
  { id: "extend", label: "Extend / outpaint", inputs: ["image"], accept: IMAGE_ACCEPT },
  { id: "product-shot", label: "Product shot", inputs: ["image"], accept: IMAGE_ACCEPT },
];

export const FACE_SWAP_OP: EnhanceOp = {
  id: "face-swap",
  label: "Face swap",
  inputs: ["source", "target"],
  accept: IMAGE_ACCEPT,
};

const ENHANCE_INDEX = new Map<string, EnhanceOp>(
  [...ENHANCE_OPS, FACE_SWAP_OP].map((o) => [o.id, o]),
);

export function enhanceOp(id: string): EnhanceOp | null {
  return ENHANCE_INDEX.get(id) ?? null;
}
