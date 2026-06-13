import { describe, it, expect } from "vitest";
import { MOTION_GROUPS, ALL_MOTIONS, DOP_QUALITY_OPTIONS } from "./studio-motions";

describe("studio-motions catalog", () => {
  it("has exactly 121 motions", () => {
    expect(ALL_MOTIONS.length).toBe(121);
  });

  it("motions are unique across groups", () => {
    expect(new Set(ALL_MOTIONS).size).toBe(ALL_MOTIONS.length);
  });

  it("spot-checks exact wire values", () => {
    for (const v of ["Bullet Time", "360 Orbit", "Tilt up", "Super 8MM", "YoYo Zoom"]) {
      expect(ALL_MOTIONS).toContain(v);
    }
  });

  it("every group has a label and at least one motion", () => {
    for (const g of MOTION_GROUPS) {
      expect(g.label).toBeTruthy();
      expect(g.motions.length).toBeGreaterThan(0);
    }
  });

  it("quality options match the hf-dop enum with dop-lite default first", () => {
    expect(DOP_QUALITY_OPTIONS.map((o) => o.value)).toEqual([
      "dop-lite", "dop-turbo", "dop-preview",
    ]);
  });
});
