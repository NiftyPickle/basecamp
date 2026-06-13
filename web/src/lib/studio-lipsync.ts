// Lipsync model catalog. Slugs are exact MUAPI endpoint names; backend
// mirror lives in hermes_cli/studio/lipsync_models.py.

export type LipsyncKind = "video" | "audio";

export type LipsyncModel = {
  slug: string;
  label: string;
  /** "video" = redub an existing video; "audio" = drive a generated video
   * from audio plus optional image/prompt. */
  kind: LipsyncKind;
  supportsSeed: boolean;
};

export const LIPSYNC_MODELS: LipsyncModel[] = [
  { slug: "latentsync-video", label: "LatentSync (video redub)", kind: "video", supportsSeed: false },
  { slug: "creatify-lipsync", label: "Creatify (video redub)", kind: "video", supportsSeed: false },
  { slug: "ltx-2-19b-lipsync", label: "LTX 2 19B (audio driven)", kind: "audio", supportsSeed: false },
  { slug: "ltx-2.3-lipsync", label: "LTX 2.3 (audio driven)", kind: "audio", supportsSeed: true },
];

export const LIPSYNC_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const LIPSYNC_DEFAULT_RESOLUTION = "720p";
export const DEFAULT_LIPSYNC_MODEL = LIPSYNC_MODELS[0];
