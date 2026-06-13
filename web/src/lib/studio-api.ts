// Thin fetchJSON wrappers for the MUAPI studio proxy. Kept separate from the
// React page so request shapes stay unit-testable. The backend gates these
// under /api/ auth and never returns the MUAPI key.

import { fetchJSON } from "./api";
import type { WorkflowTemplate } from "./studio-workflows";

export type { WorkflowTemplate };

const JSON_HEADERS = { "Content-Type": "application/json" };

export type StudioCategory = "image" | "video";

export type StudioStatus = {
  available: boolean;
  has_key: boolean;
};

// muapi-cli `models list` output is loosely shaped. Keep it open and pull a
// stable id/label in the UI rather than assuming exact field names.
export type StudioModel = Record<string, unknown>;

export type StudioJobStatus = "pending" | "running" | "completed" | "failed";

export type StudioJob = {
  status: StudioJobStatus;
  outputs: unknown[];
  error: unknown;
};

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
  return fetchJSON<StudioStatus>("/api/studio/status");
}

export async function listStudioModels(category?: StudioCategory): Promise<StudioModel[]> {
  const q = category ? `?category=${encodeURIComponent(category)}` : "";
  const out = await fetchJSON<{ models: StudioModel[] }>(`/api/studio/models${q}`);
  return dedupeModels(out.models ?? []);
}

/** muapi-cli can list the same model id more than once. Keep first occurrence
 * so the dropdown has stable, unique values. Also drops rows with no
 * derivable id, since they cannot be selected or deduped. */
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
  return fetchJSON<SubmitResponse>("/api/studio/generate", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ category, model, prompt, params: params ?? null }),
  });
}

export async function getStudioJob(requestId: string): Promise<StudioJob> {
  return fetchJSON<StudioJob>(`/api/studio/jobs/${encodeURIComponent(requestId)}`);
}

// --- shape helpers (muapi-cli output is not strictly typed) ---

/** Strings pass through, numbers stringify, everything else (objects, null,
 * arrays) is rejected so distinct malformed rows never collapse into
 * "[object Object]" and collide in dedupeModels. */
function asIdString(cand: unknown): string | undefined {
  if (typeof cand === "string") return cand;
  if (typeof cand === "number") return String(cand);
  return undefined;
}

/** Best-effort stable model id for the <option value>. Walks the candidate
 * fields in order and returns the first usable string/number; "" if none. */
export function modelId(m: StudioModel): string {
  for (const cand of [m.id, m.model, m.name, m.slug]) {
    const v = asIdString(cand);
    if (v !== undefined) return v;
  }
  return "";
}

/** Human label for a model row. */
export function modelLabel(m: StudioModel): string {
  const name = m.name ?? m.label ?? m.title ?? modelId(m);
  return typeof name === "string" ? name : modelId(m);
}

/** Pull a renderable URL out of one output entry, whatever its shape. */
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
  /** Exact muapi enum value, sent verbatim (names may contain spaces). */
  effect: string;
  image_url?: string | null;
  // Backend accepts but ignores params (effect ops take no generation params); kept for body-shape parity.
  params?: Record<string, unknown> | null;
};

export type EnhanceRequest = {
  operation: string;
  image_url?: string | null;
  source_url?: string | null;
  target_url?: string | null;
  // Backend accepts but ignores params (enhance ops take no generation params); kept for body-shape parity.
  params?: Record<string, unknown> | null;
};

export async function submitImageEdit(
  model: string,
  prompt: string,
  imageUrl: string,
  params?: StudioParams,
): Promise<SubmitResponse> {
  return fetchJSON<SubmitResponse>("/api/studio/edit", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ model, prompt, image_url: imageUrl, params: params ?? null }),
  });
}

export async function submitVideoFromImage(
  model: string,
  prompt: string,
  imageUrl: string,
  params?: StudioParams,
): Promise<SubmitResponse> {
  return fetchJSON<SubmitResponse>("/api/studio/animate", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ model, prompt, image_url: imageUrl, params: params ?? null }),
  });
}

export async function submitEffect(req: EffectRequest): Promise<SubmitResponse> {
  return fetchJSON<SubmitResponse>("/api/studio/effect", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      mode: req.mode,
      effect: req.effect,
      image_url: req.image_url ?? null,
      params: req.params ?? null,
    }),
  });
}

export async function submitEnhance(req: EnhanceRequest): Promise<SubmitResponse> {
  return fetchJSON<SubmitResponse>("/api/studio/enhance", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      operation: req.operation,
      image_url: req.image_url ?? null,
      source_url: req.source_url ?? null,
      target_url: req.target_url ?? null,
      params: req.params ?? null,
    }),
  });
}

export type MarketingRequest = {
  image_url: string;
  /** Exact MUAPI hf-dop motion enum value, sent verbatim. */
  motion: string;
  prompt: string;
  strength?: number;
  options?: string;
};

export async function submitMarketing(req: MarketingRequest): Promise<SubmitResponse> {
  return fetchJSON<SubmitResponse>("/api/studio/marketing/submit", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(req),
  });
}

export async function getMarketingJob(requestId: string): Promise<StudioJob> {
  return fetchJSON<StudioJob>(
    `/api/studio/marketing/result/${encodeURIComponent(requestId)}`,
  );
}

/** Upload a reference file; returns a hosted URL the submit endpoints accept.
 * No Content-Type header - the browser sets the multipart boundary. */
export async function uploadReference(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  return fetchJSON<{ url: string }>("/api/studio/upload", {
    method: "POST",
    body: form,
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
  return fetchJSON<SubmitResponse>("/api/studio/lipsync/submit", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(req),
  });
}

export async function getLipsyncJob(requestId: string): Promise<StudioJob> {
  return fetchJSON<StudioJob>(
    `/api/studio/lipsync/result/${encodeURIComponent(requestId)}`,
  );
}

export async function listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  const out = await fetchJSON<{ templates: WorkflowTemplate[] }>(
    "/api/studio/workflows/templates",
  );
  return out.templates ?? [];
}

export async function getWorkflowInputs(workflowId: string): Promise<unknown> {
  return fetchJSON<unknown>(
    `/api/studio/workflows/${encodeURIComponent(workflowId)}/inputs`,
  );
}

export async function executeWorkflow(
  workflowId: string,
  inputs: Record<string, unknown>,
): Promise<SubmitResponse> {
  return fetchJSON<SubmitResponse>(
    `/api/studio/workflows/${encodeURIComponent(workflowId)}/execute`,
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ inputs }) },
  );
}

export async function getWorkflowRun(runId: string): Promise<StudioJob> {
  return fetchJSON<StudioJob>(
    `/api/studio/workflows/run/${encodeURIComponent(runId)}/outputs`,
  );
}
