import { describe, it, expect } from "vitest";
import { LIPSYNC_MODELS, LIPSYNC_RESOLUTIONS } from "./studio-lipsync";

describe("studio-lipsync catalog", () => {
  it("has the four MUAPI lipsync models with exact slugs", () => {
    expect(LIPSYNC_MODELS.map((m) => m.slug)).toEqual([
      "latentsync-video",
      "creatify-lipsync",
      "ltx-2-19b-lipsync",
      "ltx-2.3-lipsync",
    ]);
  });

  it("video models need a video, audio models do not", () => {
    const byKind = Object.fromEntries(LIPSYNC_MODELS.map((m) => [m.slug, m.kind]));
    expect(byKind["latentsync-video"]).toBe("video");
    expect(byKind["creatify-lipsync"]).toBe("video");
    expect(byKind["ltx-2-19b-lipsync"]).toBe("audio");
    expect(byKind["ltx-2.3-lipsync"]).toBe("audio");
  });

  it("only ltx-2.3 supports seed", () => {
    const seeded = LIPSYNC_MODELS.filter((m) => m.supportsSeed).map((m) => m.slug);
    expect(seeded).toEqual(["ltx-2.3-lipsync"]);
  });

  it("resolutions match the MUAPI enum", () => {
    expect(LIPSYNC_RESOLUTIONS).toEqual(["480p", "720p", "1080p"]);
  });
});
