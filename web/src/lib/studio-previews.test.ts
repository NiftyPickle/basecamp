import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadPreviews, previewFor, type PreviewMap } from "./studio-previews";

const mockFetch = vi.fn();

describe("studio-previews", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and indexes the preview map", async () => {
    const mockData = {
      explode: { url: "https://cdn/e.mp4", mediaType: "video" as const },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockData),
    });

    const map: PreviewMap = await loadPreviews();
    expect(previewFor(map, "explode")).toEqual({
      url: "https://cdn/e.mp4",
      mediaType: "video",
    });
    expect(previewFor(map, "missing")).toBeNull();
  });

  it("returns an empty map when the file is absent (404)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const map = await loadPreviews();
    expect(map).toEqual({});
    expect(previewFor(map, "anything")).toBeNull();
  });

  it("returns an empty map on fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const map = await loadPreviews();
    expect(map).toEqual({});
  });

  it("returns an empty map when the body is not an object", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(null),
    });

    const map = await loadPreviews();
    expect(map).toEqual({});
  });

  it("returns an empty map when the body is an array", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ url: "https://cdn/e.mp4", mediaType: "video" }]),
    });

    const map = await loadPreviews();
    expect(map).toEqual({});
  });

  it("filters out malformed entries", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        explode: "oops",
        melt: { url: "https://cdn/m.mp4", mediaType: "video" },
        warp: { url: 42, mediaType: "video" },
        glitch: { url: "https://cdn/g.png", mediaType: "gif" },
      }),
    });

    const map = await loadPreviews();
    expect(map).toEqual({
      melt: { url: "https://cdn/m.mp4", mediaType: "video" },
    });
    expect(previewFor(map, "explode")).toBeNull();
  });
});
