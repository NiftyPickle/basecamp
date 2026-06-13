import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadPreviews, previewFor, type PreviewMap } from "./studio-previews";

// loadPreviews fetches studio-previews.json through the Electron IPC bridge
// (window.hermesDesktop.api), so the bridge is the mock target here (the web
// build mocked global fetch instead). The bridge resolves with already-parsed
// JSON, and rejects on non-200 / transport failure.
const mockApi = vi.fn();

function installBridge() {
  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    hermesDesktop: { api: mockApi },
  };
}

describe("studio-previews", () => {
  beforeEach(() => {
    mockApi.mockReset();
    installBridge();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("loads and indexes the preview map", async () => {
    mockApi.mockResolvedValue({
      explode: { url: "https://cdn/e.mp4", mediaType: "video" as const },
    });

    const map: PreviewMap = await loadPreviews();
    expect(mockApi).toHaveBeenCalledWith({ path: "/studio-previews.json", method: "GET" });
    expect(previewFor(map, "explode")).toEqual({
      url: "https://cdn/e.mp4",
      mediaType: "video",
    });
    expect(previewFor(map, "missing")).toBeNull();
  });

  it("returns an empty map when the bridge rejects (absent / 404)", async () => {
    mockApi.mockRejectedValue(new Error("404"));

    const map = await loadPreviews();
    expect(map).toEqual({});
    expect(previewFor(map, "anything")).toBeNull();
  });

  it("returns an empty map on transport error", async () => {
    mockApi.mockRejectedValue(new Error("Network error"));

    const map = await loadPreviews();
    expect(map).toEqual({});
  });

  it("returns an empty map when the body is not an object", async () => {
    mockApi.mockResolvedValue(null);

    const map = await loadPreviews();
    expect(map).toEqual({});
  });

  it("returns an empty map when the body is an array", async () => {
    mockApi.mockResolvedValue([{ url: "https://cdn/e.mp4", mediaType: "video" }]);

    const map = await loadPreviews();
    expect(map).toEqual({});
  });

  it("returns an empty map when the bridge is unavailable", async () => {
    delete (globalThis as { window?: unknown }).window;
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};

    const map = await loadPreviews();
    expect(map).toEqual({});
  });

  it("filters out malformed entries", async () => {
    mockApi.mockResolvedValue({
      explode: "oops",
      melt: { url: "https://cdn/m.mp4", mediaType: "video" },
      warp: { url: 42, mediaType: "video" },
      glitch: { url: "https://cdn/g.png", mediaType: "gif" },
    });

    const map = await loadPreviews();
    expect(map).toEqual({
      melt: { url: "https://cdn/m.mp4", mediaType: "video" },
    });
    expect(previewFor(map, "explode")).toBeNull();
  });
});
