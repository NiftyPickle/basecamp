import { describe, it, expect } from "vitest";
import {
  CINEMA_CAMERAS,
  CINEMA_LENSES,
  CINEMA_FOCALS,
  CINEMA_APERTURES,
  CINEMA_RESOLUTIONS,
  CINEMA_ASPECTS,
  CINEMA_DEFAULTS,
  CINEMA_ASSET_FILES,
  buildCinemaPromptSuffix,
} from "./cinema-prompt";

describe("cinema catalogs", () => {
  it("has the full option sets from the upstream source", () => {
    expect(CINEMA_CAMERAS).toHaveLength(6);
    expect(CINEMA_LENSES).toHaveLength(11);
    expect(CINEMA_FOCALS).toEqual([8, 14, 24, 35, 50, 85]);
    expect(CINEMA_APERTURES).toEqual(["f/1.4", "f/4", "f/11"]);
    expect(CINEMA_RESOLUTIONS).toEqual(["2K", "4K", "6K", "8K", "12K"]);
    expect(CINEMA_ASPECTS).toEqual(["16:9", "21:9", "9:16", "1:1", "4:5"]);
  });

  it("defaults are members of their catalogs", () => {
    expect(CINEMA_CAMERAS).toContain(CINEMA_DEFAULTS.camera);
    expect(CINEMA_LENSES).toContain(CINEMA_DEFAULTS.lens);
    expect(CINEMA_FOCALS).toContain(CINEMA_DEFAULTS.focal);
    expect(CINEMA_APERTURES).toContain(CINEMA_DEFAULTS.aperture);
    expect(CINEMA_RESOLUTIONS).toContain(CINEMA_DEFAULTS.resolution);
    expect(CINEMA_ASPECTS).toContain(CINEMA_DEFAULTS.aspect);
  });

  it("every camera, lens, and aperture has a preview tile", () => {
    for (const label of [...CINEMA_CAMERAS, ...CINEMA_LENSES, ...CINEMA_APERTURES]) {
      expect(CINEMA_ASSET_FILES[label], `missing tile for ${label}`).toMatch(/\.webp$/);
    }
    expect(Object.keys(CINEMA_ASSET_FILES)).toHaveLength(20);
  });
});

describe("buildCinemaPromptSuffix", () => {
  it("builds the full suffix for the defaults", () => {
    expect(buildCinemaPromptSuffix(CINEMA_DEFAULTS)).toBe(
      "Shot on a full-frame digital cinema camera, " +
        "using a premium modern prime lens at 35mm (natural cinematic perspective), " +
        "aperture f/1.4, shallow depth of field, creamy bokeh, " +
        "cinematic lighting, natural color science, high dynamic range, " +
        "professional photography, ultra-detailed, " +
        "8K resolution, ultra-detailed cinema master",
    );
  });

  it("varies with camera and resolution", () => {
    const suffix = buildCinemaPromptSuffix({
      ...CINEMA_DEFAULTS,
      camera: "Classic 16mm Film",
      resolution: "12K",
    });
    expect(suffix).toContain("classic 16mm film camera");
    expect(suffix).toContain("12K theatrical resolution, billboard-ready master");
  });
});
