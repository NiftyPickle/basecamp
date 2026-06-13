// Maps ParamSpec[] to a flat value object whose keys match the backend
// PARAM_FLAGS in hermes_cli/studio/muapi_client.py (width, height,
// aspect_ratio, num_images, duration, seed, negative_prompt).

import type { ParamSpec } from "./studio-catalog";

export type ParamValues = Record<string, string | number>;

export function defaultParamValues(specs: ParamSpec[]): ParamValues {
  const out: ParamValues = {};
  for (const spec of specs) {
    switch (spec.kind) {
      case "aspect_ratio":
        out.aspect_ratio = spec.default;
        break;
      case "resolution":
        // NOTE: resolution is not in backend PARAM_FLAGS yet - values are
        // silently dropped until the backend maps it.
        out.resolution = spec.default;
        break;
      case "count":
        out.num_images = spec.default;
        break;
      case "duration":
        out.duration = spec.default;
        break;
      case "dimension":
        out[spec.field] = spec.default;
        break;
      default:
        // Compile-time exhaustiveness check: a new ParamSpec kind must be
        // handled above or tsc fails here.
        spec satisfies never;
        break;
    }
  }
  return out;
}
