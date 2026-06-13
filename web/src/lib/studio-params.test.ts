import { describe, it, expect } from "vitest";
import { defaultParamValues, type ParamValues } from "./studio-params";
import type { ParamSpec } from "./studio-catalog";

describe("studio-params", () => {
  it("derives default values from a ParamSpec[]", () => {
    const specs: ParamSpec[] = [
      { kind: "aspect_ratio", options: ["1:1", "16:9"], default: "16:9" },
      { kind: "count", min: 1, max: 4, default: 2 },
      { kind: "duration", options: [5, 10], default: 5 },
    ];
    const v: ParamValues = defaultParamValues(specs);
    expect(v).toEqual({ aspect_ratio: "16:9", num_images: 2, duration: 5 });
  });

  it("maps dimension specs to width/height keys", () => {
    const specs: ParamSpec[] = [
      { kind: "dimension", field: "width", min: 256, max: 2048, step: 64, default: 1024 },
      { kind: "dimension", field: "height", min: 256, max: 2048, step: 64, default: 768 },
    ];
    expect(defaultParamValues(specs)).toEqual({ width: 1024, height: 768 });
  });

  it("returns an empty object for no specs", () => {
    expect(defaultParamValues([])).toEqual({});
  });
});
