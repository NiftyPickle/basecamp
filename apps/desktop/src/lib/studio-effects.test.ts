import { describe, it, expect } from "vitest";
import {
  EFFECTS,
  ENHANCE_OPS,
  FACE_SWAP_OP,
  effectsForMode,
  enhanceOp,
  type EffectEntry,
} from "./studio-effects";

describe("studio-effects catalog", () => {
  it("every effect has a key, name, wire, and valid mode", () => {
    const modes = new Set(["ai", "image"]);
    for (const e of EFFECTS) {
      expect(e.key).toBeTruthy();
      expect(e.name).toBeTruthy();
      expect(e.wire).toBeTruthy();
      expect(modes.has(e.mode)).toBe(true);
    }
  });

  it("no effect uses the retired wan or video modes", () => {
    const modes = EFFECTS.map((e) => e.mode as string);
    expect(modes).not.toContain("wan");
    expect(modes).not.toContain("video");
  });

  it("effect keys are unique", () => {
    const keys = EFFECTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ai mode has the 9 cinematic effects with spaces preserved in wire", () => {
    const ai = effectsForMode("ai");
    expect(ai.length).toBe(9);
    expect(ai.every((e: EffectEntry) => e.mode === "ai")).toBe(true);
    expect(ai.map((e) => e.wire)).toEqual([
      "Film Noir",
      "VHS Footage",
      "Cyberpunk 2077",
      "Assassin It",
      "Samurai It",
      "Robotic Face Reveal",
      "Fire",
      "Tsunami",
      "POV Driving",
    ]);
  });

  it("effectsForMode filters by mode", () => {
    const images = effectsForMode("image");
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((e: EffectEntry) => e.mode === "image")).toBe(true);
  });

  it("enhance ops include the verified single-image set", () => {
    const ids = ENHANCE_OPS.map((o) => o.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "upscale", "bg-remove", "skin", "colorize",
        "ghibli", "anime", "extend", "product-shot",
      ]),
    );
  });

  it("erase is not exposed in the frontend catalog", () => {
    expect(ENHANCE_OPS.some((o) => o.id === "erase")).toBe(false);
  });

  it("face-swap is modelled separately with two inputs", () => {
    expect(FACE_SWAP_OP.id).toBe("face-swap");
    expect(FACE_SWAP_OP.inputs).toEqual(["source", "target"]);
  });

  it("enhanceOp looks up a known op and returns null otherwise", () => {
    expect(enhanceOp("upscale")!.label).toBeTruthy();
    expect(enhanceOp("nope")).toBeNull();
  });
});
