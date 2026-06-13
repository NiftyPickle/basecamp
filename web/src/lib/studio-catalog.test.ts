import { describe, it, expect } from "vitest";
import {
  CATALOG,
  catalogModel,
  modelsForMode,
  minimalParams,
  type StudioMode,
} from "./studio-catalog";

describe("studio-catalog", () => {
  it("indexes a known t2i model with image params", () => {
    const m = catalogModel("t2i", "flux-dev");
    expect(m).toBeTruthy();
    expect(m!.mode).toBe("t2i");
    const kinds = m!.params.map((p) => p.kind);
    expect(kinds).toContain("aspect_ratio");
    expect(kinds).toContain("count");
  });

  it("flags i2i and i2v models as needing an image", () => {
    expect(catalogModel("i2i", "flux-kontext-dev")!.needs_image).toBe(true);
    expect(catalogModel("i2v", "kling-std")!.needs_image).toBe(true);
    expect(catalogModel("t2i", "flux-dev")!.needs_image).toBeFalsy();
  });

  it("gives video models a duration control", () => {
    const kinds = catalogModel("t2v", "kling-master")!.params.map((p) => p.kind);
    expect(kinds).toContain("duration");
    expect(kinds).toContain("aspect_ratio");
  });

  it("every catalog model has at least the minimal params for its mode", () => {
    for (const m of CATALOG) {
      expect(m.params.length).toBeGreaterThan(0);
    }
  });

  it("modelsForMode returns only that mode, in catalog order", () => {
    const ids = modelsForMode("t2v").map((m) => m.id);
    expect(ids[0]).toBe("veo3");
    expect(ids).toContain("kling-master");
    expect(ids).not.toContain("flux-dev");
  });

  it("minimalParams falls back for an uncatalogued model", () => {
    const params = minimalParams("t2i");
    const kinds = params.map((p) => p.kind);
    expect(kinds).toEqual(expect.arrayContaining(["aspect_ratio", "count"]));
  });

  it("returns null for an unknown model id", () => {
    expect(catalogModel("t2i", "does-not-exist")).toBeNull();
  });

  it("has no duplicate mode:id keys", () => {
    const keys = CATALOG.map((m) => `${m.mode}:${m.id}`);
    expect(new Set(keys).size).toBe(CATALOG.length);
  });

  it("uses display-name overrides for awkward ids", () => {
    expect(catalogModel("t2i", "gpt4o")!.name).toBe("GPT-4o");
    expect(catalogModel("t2v", "veo3")!.name).toBe("Veo 3");
  });

  const modes: StudioMode[] = ["t2i", "i2i", "t2v", "i2v"];
  it.each(modes)("has at least one model for mode %s", (mode) => {
    expect(modelsForMode(mode).length).toBeGreaterThan(0);
  });
});
