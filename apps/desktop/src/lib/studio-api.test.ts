import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStudioStatus,
  listStudioModels,
  submitStudioJob,
  getStudioJob,
  dedupeModels,
  modelId,
  modelLabel,
  outputUrl,
} from "./studio-api";

type ApiCall = { path: string; method?: string; body?: unknown };

function mockBridge(impl: (req: ApiCall) => unknown) {
  const api = vi.fn(async (req: ApiCall) => impl(req));
  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    hermesDesktop: { api },
  };
  return api;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe("studio-api desktop adapter", () => {
  it("getStudioStatus routes a GET through the IPC bridge", async () => {
    const api = mockBridge(() => ({ available: true, has_key: true }));
    const out = await getStudioStatus();
    expect(out).toEqual({ available: true, has_key: true });
    expect(api).toHaveBeenCalledWith({ path: "/api/studio/status", method: "GET" });
  });

  it("listStudioModels passes a category query and dedupes", async () => {
    const api = mockBridge(() => ({ models: [{ id: "a" }, { id: "a" }, { id: "b" }] }));
    const out = await listStudioModels("image");
    expect(api).toHaveBeenCalledWith({ path: "/api/studio/models?category=image", method: "GET" });
    expect(out).toHaveLength(2);
  });

  it("submitStudioJob POSTs the category/model/prompt body", async () => {
    const api = mockBridge(() => ({ request_id: "req-1" }));
    const out = await submitStudioJob("image", "m1", "a cat", { width: 512 });
    expect(out).toEqual({ request_id: "req-1" });
    expect(api).toHaveBeenCalledWith({
      path: "/api/studio/generate",
      method: "POST",
      body: { category: "image", model: "m1", prompt: "a cat", params: { width: 512 } },
    });
  });

  it("getStudioJob encodes the request id in the path", async () => {
    const api = mockBridge(() => ({ status: "completed", outputs: [], error: null }));
    await getStudioJob("a/b");
    expect(api).toHaveBeenCalledWith({ path: "/api/studio/jobs/a%2Fb", method: "GET" });
  });

  it("throws a clear error when the bridge is unavailable", async () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    await expect(getStudioStatus()).rejects.toThrow("Desktop API bridge unavailable");
  });
});

describe("studio-api pure helpers carry over unchanged", () => {
  it("modelId walks candidate fields", () => {
    expect(modelId({ slug: "s" })).toBe("s");
    expect(modelId({})).toBe("");
  });
  it("modelLabel falls back to id", () => {
    expect(modelLabel({ id: "x" })).toBe("x");
  });
  it("outputUrl extracts a url from an object", () => {
    expect(outputUrl({ video_url: "http://x/v.mp4" })).toBe("http://x/v.mp4");
    expect(outputUrl(123)).toBeNull();
  });
  it("dedupeModels drops id-less rows", () => {
    expect(dedupeModels([{ id: "a" }, {}])).toHaveLength(1);
  });
});
