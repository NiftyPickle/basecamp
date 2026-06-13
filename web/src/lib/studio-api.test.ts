import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchJSON = vi.fn();
vi.mock("./api", () => ({ fetchJSON: (...args: unknown[]) => fetchJSON(...args) }));

import {
  submitImageEdit,
  submitVideoFromImage,
  submitEffect,
  submitEnhance,
  submitMarketing,
  getMarketingJob,
  submitLipsync,
  getLipsyncJob,
  listWorkflowTemplates,
  executeWorkflow,
  getWorkflowRun,
  uploadReference,
  dedupeModels,
  modelId,
  modelLabel,
  outputUrl,
  type StudioModel,
} from "./studio-api";
beforeEach(() => {
  fetchJSON.mockReset();
  fetchJSON.mockResolvedValue({ request_id: "r1" });
});

describe("studio-api submit clients", () => {
  it("submitImageEdit posts the edit body", async () => {
    await submitImageEdit("flux-kontext-dev", "blue", "https://x/a.png", { num_images: 2 });
    const [url, opts] = fetchJSON.mock.calls[0];
    expect(url).toBe("/api/studio/edit");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(opts.body)).toEqual({
      model: "flux-kontext-dev",
      prompt: "blue",
      image_url: "https://x/a.png",
      params: { num_images: 2 },
    });
  });

  it("submitVideoFromImage posts the animate body", async () => {
    await submitVideoFromImage("kling-std", "pan", "https://x/a.png");
    const [url, opts] = fetchJSON.mock.calls[0];
    expect(url).toBe("/api/studio/animate");
    expect(JSON.parse(opts.body)).toEqual({
      model: "kling-std",
      prompt: "pan",
      image_url: "https://x/a.png",
      params: null,
    });
  });

  it("submitEffect posts mode + the verbatim effect name + image_url", async () => {
    await submitEffect({ mode: "ai", effect: "Crush It", image_url: "https://x/a.png" });
    const [url, opts] = fetchJSON.mock.calls[0];
    expect(url).toBe("/api/studio/effect");
    expect(JSON.parse(opts.body)).toEqual({
      mode: "ai",
      effect: "Crush It",
      image_url: "https://x/a.png",
      params: null,
    });
  });

  it("submitEnhance posts operation + image_url", async () => {
    await submitEnhance({ operation: "upscale", image_url: "https://x/a.png" });
    const [url, opts] = fetchJSON.mock.calls[0];
    expect(url).toBe("/api/studio/enhance");
    expect(JSON.parse(opts.body)).toEqual({
      operation: "upscale",
      image_url: "https://x/a.png",
      source_url: null,
      target_url: null,
      params: null,
    });
  });

  it("submitMarketing posts the marketing body", async () => {
    fetchJSON.mockResolvedValueOnce({ request_id: "mk-1" });
    const out = await submitMarketing({
      image_url: "https://x/i.png",
      motion: "Bullet Time",
      prompt: "p",
      strength: 0.8,
      options: "dop-turbo",
    });
    expect(out).toEqual({ request_id: "mk-1" });
    const [url, opts] = fetchJSON.mock.calls.at(-1)!;
    expect(String(url)).toContain("/api/studio/marketing/submit");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(opts.body)).toEqual({
      image_url: "https://x/i.png",
      motion: "Bullet Time",
      prompt: "p",
      strength: 0.8,
      options: "dop-turbo",
    });
  });

  it("getMarketingJob fetches the marketing result route", async () => {
    fetchJSON.mockResolvedValueOnce({ status: "completed", outputs: [], error: null });
    await getMarketingJob("mk-1");
    const [url] = fetchJSON.mock.calls.at(-1)!;
    expect(String(url)).toContain("/api/studio/marketing/result/mk-1");
  });

  it("uploadReference posts FormData to the upload endpoint", async () => {
    fetchJSON.mockResolvedValue({ url: "https://cdn/up/x.png" });
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const out = await uploadReference(file);
    expect(out).toEqual({ url: "https://cdn/up/x.png" });
    const [url, opts] = fetchJSON.mock.calls[0];
    expect(url).toBe("/api/studio/upload");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBeInstanceOf(FormData);
    expect((opts.body as FormData).get("file")).toBe(file);
  });
});

describe("studio-api shape helpers", () => {
  describe("modelId", () => {
    it.each<[string, StudioModel, string]>([
      ["prefers id over later candidates", { id: "a", model: "b", name: "c", slug: "d" }, "a"],
      ["falls back to model when id missing", { model: "b", name: "c" }, "b"],
      ["falls back to name when id and model missing", { name: "c", slug: "d" }, "c"],
      ["falls back to slug last", { slug: "d" }, "d"],
      ["stringifies numeric candidates", { id: 42 }, "42"],
      ["skips object candidates and continues the chain", { id: { nested: true }, model: "b" }, "b"],
      ["skips array candidates and continues the chain", { id: ["x"], name: "c" }, "c"],
      ["returns empty string when nothing is derivable", {}, ""],
      ["returns empty string when all candidates are objects", { id: {}, model: {} }, ""],
    ])("%s", (_name, input, expected) => {
      expect(modelId(input)).toBe(expected);
    });

    it("does not collapse distinct malformed models into [object Object]", () => {
      expect(modelId({ id: { a: 1 } })).not.toBe("[object Object]");
      expect(modelId({ id: { b: 2 } })).not.toBe("[object Object]");
    });
  });

  describe("modelLabel", () => {
    it.each<[string, StudioModel, string]>([
      ["prefers name", { name: "Nice Name", label: "L", title: "T", id: "i" }, "Nice Name"],
      ["falls back to label", { label: "Label", title: "T", id: "i" }, "Label"],
      ["falls back to title", { title: "Title", id: "i" }, "Title"],
      ["falls back to modelId when no display fields", { id: "raw-id" }, "raw-id"],
      ["falls back to modelId when name is not a string", { name: 7, id: "raw-id" }, "raw-id"],
      ["returns empty string when nothing is derivable", {}, ""],
    ])("%s", (_name, input, expected) => {
      expect(modelLabel(input)).toBe(expected);
    });
  });

  describe("outputUrl", () => {
    it.each<[string, unknown, string | null]>([
      ["returns plain string outputs as-is", "https://x/a.png", "https://x/a.png"],
      ["reads url field", { url: "https://x/u.png" }, "https://x/u.png"],
      ["reads image_url field", { image_url: "https://x/i.png" }, "https://x/i.png"],
      ["reads video_url field", { video_url: "https://x/v.mp4" }, "https://x/v.mp4"],
      ["reads output_url field", { output_url: "https://x/o.png" }, "https://x/o.png"],
      ["reads src field", { src: "https://x/s.png" }, "https://x/s.png"],
      ["prefers url over later keys", { url: "https://x/u.png", src: "https://x/s.png" }, "https://x/u.png"],
      ["skips empty-string values and keeps scanning", { url: "", src: "https://x/s.png" }, "https://x/s.png"],
      ["skips non-string values", { url: 123, image_url: "https://x/i.png" }, "https://x/i.png"],
      ["returns null for arrays without url keys", ["https://x/a.png"], null],
      ["returns null for objects without url keys", { foo: "bar" }, null],
      ["returns null for null", null, null],
      ["returns null for undefined", undefined, null],
      ["returns null for numbers", 42, null],
    ])("%s", (_name, input, expected) => {
      expect(outputUrl(input)).toBe(expected);
    });
  });

  describe("dedupeModels", () => {
    it("dedupes by id, keeping the first occurrence", () => {
      const first = { id: "a", v: 1 };
      const dupe = { id: "a", v: 2 };
      expect(dedupeModels([first, dupe])).toEqual([first]);
    });

    it("drops rows with no derivable id", () => {
      const keep = { id: "a" };
      expect(dedupeModels([{}, keep, { id: {} }])).toEqual([keep]);
    });

    it("preserves input order", () => {
      const models = [{ id: "b" }, { id: "a" }, { id: "c" }];
      expect(dedupeModels(models).map(modelId)).toEqual(["b", "a", "c"]);
    });

    it("returns a new array without mutating the input", () => {
      const models = [{ id: "a" }, { id: "a" }, { id: "b" }];
      const snapshot = [...models];
      const out = dedupeModels(models);
      expect(out).not.toBe(models);
      expect(models).toEqual(snapshot);
    });
  });
});

describe("studio-api lipsync clients", () => {
  it("submitLipsync posts the lipsync body", async () => {
    fetchJSON.mockResolvedValueOnce({ request_id: "ls-1" });
    const out = await submitLipsync({
      model: "ltx-2-19b-lipsync",
      audio_url: "https://x/a.mp3",
      image_url: "https://x/i.png",
      resolution: "720p",
    });
    expect(out).toEqual({ request_id: "ls-1" });
    const [url, opts] = fetchJSON.mock.calls.at(-1)!;
    expect(String(url)).toContain("/api/studio/lipsync/submit");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(opts.body)).toEqual({
      model: "ltx-2-19b-lipsync",
      audio_url: "https://x/a.mp3",
      image_url: "https://x/i.png",
      resolution: "720p",
    });
  });

  it("getLipsyncJob fetches the lipsync result route", async () => {
    fetchJSON.mockResolvedValueOnce({ status: "running", outputs: [], error: null });
    await getLipsyncJob("ls-1");
    const [url] = fetchJSON.mock.calls.at(-1)!;
    expect(String(url)).toContain("/api/studio/lipsync/result/ls-1");
  });
});

describe("studio-api workflow clients", () => {
  it("listWorkflowTemplates returns the templates array", async () => {
    fetchJSON.mockResolvedValueOnce({
      templates: [{ id: "a", name: "X", thumbnail: null, category: "Featured" }],
    });
    const out = await listWorkflowTemplates();
    expect(out).toHaveLength(1);
    const [url] = fetchJSON.mock.calls.at(-1)!;
    expect(String(url)).toContain("/api/studio/workflows/templates");
  });

  it("executeWorkflow posts the inputs body", async () => {
    fetchJSON.mockResolvedValueOnce({ request_id: "run-1" });
    const out = await executeWorkflow("wf-1", { style: "noir" });
    expect(out).toEqual({ request_id: "run-1" });
    const [url, opts] = fetchJSON.mock.calls.at(-1)!;
    expect(String(url)).toContain("/api/studio/workflows/wf-1/execute");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(opts.body)).toEqual({ inputs: { style: "noir" } });
  });

  it("getWorkflowRun fetches the workflow run outputs route", async () => {
    fetchJSON.mockResolvedValueOnce({ status: "running", outputs: [], error: null });
    await getWorkflowRun("run-1");
    const [url] = fetchJSON.mock.calls.at(-1)!;
    expect(String(url)).toContain("/api/studio/workflows/run/run-1/outputs");
  });
});
