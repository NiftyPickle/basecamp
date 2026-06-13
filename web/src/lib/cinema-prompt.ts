// Cinema prompt builder. Adds camera/lens/focal/aperture chrome to a user
// prompt so the image model renders in a specific cinematic style. Ported
// from beyond-marketing-ai-app lib/cinema-prompt.ts, itself a port of
// Anil-matcha/Open-Generative-AI CinemaStudio.jsx (MIT).

import { HERMES_BASE_PATH } from "./api";

export const CAMERA_MAP = {
  "Modular 8K Digital": "modular 8K digital cinema camera",
  "Full-Frame Cine Digital": "full-frame digital cinema camera",
  "Grand Format 70mm Film": "grand format 70mm film camera",
  "Studio Digital S35": "Super 35 studio digital camera",
  "Classic 16mm Film": "classic 16mm film camera",
  "Premium Large Format Digital": "premium large-format digital cinema camera",
} as const;
export type CinemaCamera = keyof typeof CAMERA_MAP;

export const LENS_MAP = {
  "Creative Tilt Lens": "creative tilt lens effect",
  "Compact Anamorphic": "compact anamorphic lens",
  "Extreme Macro": "extreme macro lens",
  "70s Cinema Prime": "1970s cinema prime lens",
  "Classic Anamorphic": "classic anamorphic lens",
  "Premium Modern Prime": "premium modern prime lens",
  "Warm Cinema Prime": "warm-toned cinema prime lens",
  "Swirl Bokeh Portrait": "swirl bokeh portrait lens",
  "Vintage Prime": "vintage prime lens",
  "Halation Diffusion": "halation diffusion filter",
  "Clinical Sharp Prime": "ultra-sharp clinical prime lens",
} as const;
export type CinemaLens = keyof typeof LENS_MAP;

export const FOCAL_PERSPECTIVE: Record<number, string> = {
  8: "ultra-wide perspective",
  14: "wide-angle perspective",
  24: "wide-angle dynamic perspective",
  35: "natural cinematic perspective",
  50: "standard portrait perspective",
  85: "classic portrait perspective",
};

export const APERTURE_EFFECT = {
  "f/1.4": "shallow depth of field, creamy bokeh",
  "f/4": "balanced depth of field",
  "f/11": "deep focus clarity, sharp foreground to background",
} as const;
export type CinemaAperture = keyof typeof APERTURE_EFFECT;

// Resolution / target master quality. The model can't be forced to render
// exact px dimensions, but the verbal hint biases sharpness + detail level.
export const RESOLUTION_EFFECT = {
  "2K": "2K resolution, broadcast-ready clarity",
  "4K": "4K UHD resolution, sharp consumer master",
  "6K": "6K oversampled resolution, fine grain control",
  "8K": "8K resolution, ultra-detailed cinema master",
  "12K": "12K theatrical resolution, billboard-ready master",
} as const;
export type CinemaResolution = keyof typeof RESOLUTION_EFFECT;

export const CINEMA_CAMERAS = Object.keys(CAMERA_MAP) as CinemaCamera[];
export const CINEMA_LENSES = Object.keys(LENS_MAP) as CinemaLens[];
export const CINEMA_FOCALS = Object.keys(FOCAL_PERSPECTIVE)
  .map((k) => parseInt(k, 10))
  .sort((a, b) => a - b);
export const CINEMA_APERTURES = Object.keys(APERTURE_EFFECT) as CinemaAperture[];
export const CINEMA_RESOLUTIONS = Object.keys(RESOLUTION_EFFECT) as CinemaResolution[];

export const CINEMA_ASPECTS = ["16:9", "21:9", "9:16", "1:1", "4:5"] as const;
export type CinemaAspect = (typeof CINEMA_ASPECTS)[number];

// Preview tile filenames under web/public/cinema/ (copied from
// Anil-matcha/Open-Generative-AI via the beyond app, MIT). Cameras, lenses,
// and apertures have tiles; focals/resolutions/aspects render as text chips.
export const CINEMA_ASSET_FILES: Record<string, string> = {
  // Cameras
  "Modular 8K Digital": "modular_8k_digital.webp",
  "Full-Frame Cine Digital": "full_frame_cine_digital.webp",
  "Grand Format 70mm Film": "grand_format_70mm_film.webp",
  "Studio Digital S35": "studio_digital_s35.webp",
  "Classic 16mm Film": "classic_16mm_film.webp",
  "Premium Large Format Digital": "premium_large_format_digital.webp",
  // Lenses
  "Creative Tilt Lens": "creative_tilt_lens.webp",
  "Compact Anamorphic": "compact_anamorphic.webp",
  "Extreme Macro": "extreme_macro.webp",
  "70s Cinema Prime": "70s_cinema_prime.webp",
  "Classic Anamorphic": "classic_anamorphic.webp",
  "Premium Modern Prime": "premium_modern_prime.webp",
  "Warm Cinema Prime": "warm_cinema_prime.webp",
  "Swirl Bokeh Portrait": "swirl_bokeh_portrait.webp",
  "Vintage Prime": "vintage_prime.webp",
  "Halation Diffusion": "halation_diffusion.webp",
  "Clinical Sharp Prime": "clinical_sharp_prime.webp",
  // Apertures
  "f/1.4": "f_1_4.webp",
  "f/4": "f_4.webp",
  "f/11": "f_11.webp",
};

export function cinemaAssetUrl(label: string): string | null {
  const file = CINEMA_ASSET_FILES[label];
  return file ? `${HERMES_BASE_PATH}/cinema/${file}` : null;
}

export type CinemaSettings = {
  camera: CinemaCamera;
  lens: CinemaLens;
  focal: number;
  aperture: CinemaAperture;
  aspect: CinemaAspect;
  resolution: CinemaResolution;
};

export const CINEMA_DEFAULTS: CinemaSettings = {
  camera: "Full-Frame Cine Digital",
  lens: "Premium Modern Prime",
  focal: 35,
  aperture: "f/1.4",
  aspect: "16:9",
  resolution: "8K",
};

// Build the cinematic suffix appended to the user's base prompt. Aspect is
// intentionally absent - it is submitted as params.aspect_ratio instead.
export function buildCinemaPromptSuffix(s: CinemaSettings): string {
  const cameraDesc = CAMERA_MAP[s.camera] ?? s.camera;
  const lensDesc = LENS_MAP[s.lens] ?? s.lens;
  const perspective = FOCAL_PERSPECTIVE[s.focal] ?? "";
  const depthEffect = APERTURE_EFFECT[s.aperture] ?? "";
  const resDesc = RESOLUTION_EFFECT[s.resolution] ?? "8K resolution";
  const parts = [
    `Shot on a ${cameraDesc}`,
    `using a ${lensDesc} at ${s.focal}mm${perspective ? ` (${perspective})` : ""}`,
    `aperture ${s.aperture}`,
    depthEffect,
    "cinematic lighting",
    "natural color science",
    "high dynamic range",
    "professional photography",
    "ultra-detailed",
    resDesc,
  ];
  return parts.filter((p) => p && p.trim() !== "").join(", ");
}
