// Static, hand-authored model catalog. The model ids and which models accept
// images come from the live muapi CLI (image generate / image edit / video
// generate / video from-image --help). The live /api/studio/models call
// decides availability at runtime; this catalog decides which parameter
// controls and example prompt to render for a model. Unknown live models fall
// back to minimalParams() so the UI never crashes on a model we have not
// catalogued.

export type StudioMode = "t2i" | "i2i" | "t2v" | "i2v";

export type ParamSpec =
  | { kind: "aspect_ratio"; options: string[]; default: string }
  | { kind: "resolution"; options: string[]; default: string }
  | { kind: "dimension"; field: "width" | "height"; min: number; max: number; step: number; default: number }
  | { kind: "count"; min: number; max: number; default: number }
  | { kind: "duration"; options: number[]; default: number };

export type CatalogModel = {
  id: string;
  name: string;
  mode: StudioMode;
  example_prompt?: string;
  params: ParamSpec[];
  needs_image?: boolean;
};

const IMAGE_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4"];
const VIDEO_ASPECTS = ["16:9", "9:16", "1:1"];

const ASPECT_IMAGE: ParamSpec = { kind: "aspect_ratio", options: IMAGE_ASPECTS, default: "1:1" };
const ASPECT_VIDEO: ParamSpec = { kind: "aspect_ratio", options: VIDEO_ASPECTS, default: "16:9" };
const COUNT: ParamSpec = { kind: "count", min: 1, max: 4, default: 1 };
const DURATION: ParamSpec = { kind: "duration", options: [5, 10], default: 5 };

function imageParams(): ParamSpec[] {
  return [{ ...ASPECT_IMAGE }, { ...COUNT }];
}
function videoParams(): ParamSpec[] {
  return [{ ...ASPECT_VIDEO }, { ...DURATION }];
}

/** Minimal fallback param set for a mode (used when a live model is not in the catalog). */
export function minimalParams(mode: StudioMode): ParamSpec[] {
  return mode === "t2v" || mode === "i2v" ? videoParams() : imageParams();
}

// Display-name overrides for ids the generic title-caser mangles.
const NAME_OVERRIDES: Record<string, string> = {
  gpt4o: "GPT-4o",
  veo3: "Veo 3",
  "veo3-fast": "Veo 3 Fast",
  "wan2.1": "Wan 2.1",
  "wan2.2": "Wan 2.2",
  hidream: "HiDream",
  "hidream-fast": "HiDream Fast",
  "hidream-dev": "HiDream Dev",
  "hidream-full": "HiDream Full",
};

// Title-case a model id for display, with overrides for ids the splitter mangles.
function label(id: string): string {
  const override = NAME_OVERRIDES[id];
  if (override) return override;
  return id
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function makeModels(
  ids: string[],
  mode: StudioMode,
  paramsFor: () => ParamSpec[],
  examplePrompt: string,
  needsImage: boolean,
): CatalogModel[] {
  return ids.map((id) => ({
    id,
    name: label(id),
    mode,
    example_prompt: examplePrompt,
    params: paramsFor(),
    needs_image: needsImage || undefined,
  }));
}

const T2I_IDS = [
  "flux-dev", "flux-schnell", "flux-kontext-dev", "flux-kontext-pro",
  "flux-kontext-max", "hidream-fast", "hidream-dev", "hidream-full",
  "wan2.1", "reve", "gpt4o", "midjourney", "seedream", "qwen",
];
const I2I_IDS = [
  "flux-kontext-dev", "flux-kontext-pro", "flux-kontext-max",
  "flux-kontext-effects", "gpt4o", "reve", "seededit",
  "midjourney", "midjourney-style", "midjourney-omni", "qwen",
];
const T2V_IDS = [
  "veo3", "veo3-fast", "kling-master", "wan2.1", "wan2.2",
  "seedance-pro", "seedance-lite", "hunyuan", "runway",
  "pixverse", "vidu", "minimax-std", "minimax-pro",
];
const I2V_IDS = [
  "veo3", "veo3-fast", "kling-std", "kling-pro", "kling-master",
  "wan2.1", "wan2.2", "seedance-pro", "seedance-lite", "hunyuan",
  "runway", "pixverse", "vidu", "midjourney", "minimax-std", "minimax-pro",
];

export const CATALOG: ReadonlyArray<CatalogModel> = [
  ...makeModels(T2I_IDS, "t2i", imageParams, "A serene mountain lake at golden hour, cinematic, high detail", false),
  ...makeModels(I2I_IDS, "i2i", imageParams, "Make the sky a dramatic sunset, keep the subject sharp", true),
  ...makeModels(T2V_IDS, "t2v", videoParams, "A drone shot flying over ocean waves at sunrise", false),
  ...makeModels(I2V_IDS, "i2v", videoParams, "Slow gentle camera push-in, subtle natural motion", true),
];

const INDEX = new Map<string, CatalogModel>(
  CATALOG.map((m) => [`${m.mode}:${m.id}`, m]),
);

/** Look up a catalog model by mode + id. Returns null if not catalogued. */
export function catalogModel(mode: StudioMode, id: string): CatalogModel | null {
  return INDEX.get(`${mode}:${id}`) ?? null;
}

/** All catalogued models for a mode, in declared order. */
export function modelsForMode(mode: StudioMode): CatalogModel[] {
  return CATALOG.filter((m) => m.mode === mode);
}
