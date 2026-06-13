// Desktop studio API adapter. Same surface as web/src/lib/studio-api.ts, but
// every request goes through the Electron IPC bridge (window.hermesDesktop.api),
// which the main process routes to the backend baseUrl with the
// X-Hermes-Session-Token header attached. The backend gates /api/studio/* under
// auth and never returns the MUAPI key.
import type { WorkflowTemplate } from "./studio-workflows";

export type { WorkflowTemplate };

interface ApiRequest {
  path: string;
  method?: string;
  body?: unknown;
}

function call<T>(req: ApiRequest): Promise<T> {
  const bridge = window.hermesDesktop;
  if (!bridge?.api) {
    throw new Error("Desktop API bridge unavailable");
  }
  return bridge.api<T>(req);
}

export type StudioCategory = "image" | "video";
export type StudioStatus = { available: boolean; has_key: boolean };
export type StudioModel = Record<string, unknown>;
export type StudioJobStatus = "pending" | "running" | "completed" | "failed";
export type StudioJob = { status: StudioJobStatus; outputs: unknown[]; error: unknown };
export type StudioParams = {
  width?: number;
  height?: number;
  aspect_ratio?: string;
  num_images?: number;
  duration?: number;
  seed?: number;
  negative_prompt?: string;
};
export type SubmitResponse = { request_id: string };

export async function getStudioStatus(): Promise<StudioStatus> {
  return call<StudioStatus>({ path: "/api/studio/status", method: "GET" });
}

export async function listStudioModels(category?: StudioCategory): Promise<StudioModel[]> {
  const q = category ? `?category=${encodeURIComponent(category)}` : "";
  const out = await call<{ models: StudioModel[] }>({ path: `/api/studio/models${q}`, method: "GET" });
  return dedupeModels(out.models ?? []);
}

export function dedupeModels(models: StudioModel[]): StudioModel[] {
  const seen = new Set<string>();
  const out: StudioModel[] = [];
  for (const m of models) {
    const id = modelId(m);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(m);
  }
  return out;
}

export async function submitStudioJob(
  category: StudioCategory,
  model: string,
  prompt: string,
  params?: StudioParams,
): Promise<SubmitResponse> {
  return call<SubmitResponse>({
    path: "/api/studio/generate",
    method: "POST",
    body: { category, model, prompt, params: params ?? null },
  });
}

export async function getStudioJob(requestId: string): Promise<StudioJob> {
  return call<StudioJob>({ path: `/api/studio/jobs/${encodeURIComponent(requestId)}`, method: "GET" });
}

function asIdString(cand: unknown): string | undefined {
  if (typeof cand === "string") return cand;
  if (typeof cand === "number") return String(cand);
  return undefined;
}

export function modelId(m: StudioModel): string {
  for (const cand of [m.id, m.model, m.name, m.slug]) {
    const v = asIdString(cand);
    if (v !== undefined) return v;
  }
  return "";
}

export function modelLabel(m: StudioModel): string {
  const name = m.name ?? m.label ?? m.title ?? modelId(m);
  return typeof name === "string" ? name : modelId(m);
}

export function outputUrl(out: unknown): string | null {
  if (typeof out === "string") return out;
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;
    for (const key of ["url", "image_url", "video_url", "output_url", "src"]) {
      const v = o[key];
      if (typeof v === "string" && v) return v;
    }
  }
  return null;
}

export type EffectMode = "ai" | "image";
export type EffectRequest = {
  mode: EffectMode;
  effect: string;
  image_url?: string | null;
  params?: Record<string, unknown> | null;
};
export type EnhanceRequest = {
  operation: string;
  image_url?: string | null;
  source_url?: string | null;
  target_url?: string | null;
  params?: Record<string, unknown> | null;
};

export async function submitImageEdit(
  model: string,
  prompt: string,
  imageUrl: string,
  params?: StudioParams,
): Promise<SubmitResponse> {
  return call<SubmitResponse>({
    path: "/api/studio/edit",
    method: "POST",
    body: { model, prompt, image_url: imageUrl, params: params ?? null },
  });
}

export async function submitVideoFromImage(
  model: string,
  prompt: string,
  imageUrl: string,
  params?: StudioParams,
): Promise<SubmitResponse> {
  return call<SubmitResponse>({
    path: "/api/studio/animate",
    method: "POST",
    body: { model, prompt, image_url: imageUrl, params: params ?? null },
  });
}

export async function submitEffect(req: EffectRequest): Promise<SubmitResponse> {
  return call<SubmitResponse>({
    path: "/api/studio/effect",
    method: "POST",
    body: { mode: req.mode, effect: req.effect, image_url: req.image_url ?? null, params: req.params ?? null },
  });
}

export async function submitEnhance(req: EnhanceRequest): Promise<SubmitResponse> {
  return call<SubmitResponse>({
    path: "/api/studio/enhance",
    method: "POST",
    body: {
      operation: req.operation,
      image_url: req.image_url ?? null,
      source_url: req.source_url ?? null,
      target_url: req.target_url ?? null,
      params: req.params ?? null,
    },
  });
}

export type MarketingRequest = {
  image_url: string;
  motion: string;
  prompt: string;
  strength?: number;
  options?: string;
};

export async function submitMarketing(req: MarketingRequest): Promise<SubmitResponse> {
  return call<SubmitResponse>({ path: "/api/studio/marketing/submit", method: "POST", body: req });
}

export async function getMarketingJob(requestId: string): Promise<StudioJob> {
  return call<StudioJob>({ path: `/api/studio/marketing/result/${encodeURIComponent(requestId)}`, method: "GET" });
}

export async function uploadReference(file: File): Promise<{ url: string }> {
  // FormData/File do not survive structured clone across the IPC bridge. Read
  // bytes in the renderer and send a plain object the main process reassembles
  // into multipart for POST /api/studio/upload.
  const bytes = new Uint8Array(await file.arrayBuffer());
  return call<{ url: string }>({
    path: "/api/studio/upload",
    method: "POST",
    body: { upload: { filename: file.name, contentType: file.type || "application/octet-stream", bytes } },
  });
}

export type LipsyncRequest = {
  model: string;
  audio_url: string;
  video_url?: string;
  image_url?: string;
  prompt?: string;
  resolution?: string;
  seed?: number;
};

export async function submitLipsync(req: LipsyncRequest): Promise<SubmitResponse> {
  return call<SubmitResponse>({ path: "/api/studio/lipsync/submit", method: "POST", body: req });
}

export async function getLipsyncJob(requestId: string): Promise<StudioJob> {
  return call<StudioJob>({ path: `/api/studio/lipsync/result/${encodeURIComponent(requestId)}`, method: "GET" });
}

export async function listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  const out = await call<{ templates: WorkflowTemplate[] }>({ path: "/api/studio/workflows/templates", method: "GET" });
  return out.templates ?? [];
}

export async function getWorkflowInputs(workflowId: string): Promise<unknown> {
  return call<unknown>({ path: `/api/studio/workflows/${encodeURIComponent(workflowId)}/inputs`, method: "GET" });
}

export async function executeWorkflow(
  workflowId: string,
  inputs: Record<string, unknown>,
): Promise<SubmitResponse> {
  return call<SubmitResponse>({
    path: `/api/studio/workflows/${encodeURIComponent(workflowId)}/execute`,
    method: "POST",
    body: { inputs },
  });
}

export async function getWorkflowRun(runId: string): Promise<StudioJob> {
  return call<StudioJob>({ path: `/api/studio/workflows/run/${encodeURIComponent(runId)}/outputs`, method: "GET" });
}
