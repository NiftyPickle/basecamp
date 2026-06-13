import { describe, it, expect } from "vitest";
import {
  groupTemplates,
  normalizeWorkflowInputs,
  type WorkflowTemplate,
} from "./studio-workflows";

const TEMPLATES: WorkflowTemplate[] = [
  { id: "a", name: "Product Photography", thumbnail: "https://x/a.jpg", category: "E-Commerce" },
  { id: "b", name: "Room Redesign", thumbnail: null, category: "Home Decor" },
  { id: "c", name: "Hero Banner", thumbnail: "https://x/c.jpg", category: "E-Commerce" },
];

describe("groupTemplates", () => {
  it("groups by category preserving first-seen order", () => {
    const groups = groupTemplates(TEMPLATES);
    expect(groups.map((g) => g.category)).toEqual(["E-Commerce", "Home Decor"]);
    expect(groups[0].templates.map((t) => t.id)).toEqual(["a", "c"]);
  });
});

describe("normalizeWorkflowInputs", () => {
  it("parses a list of field objects", () => {
    const fields = normalizeWorkflowInputs({
      inputs: [
        { name: "image_url", label: "Image", type: "image", required: true },
        { name: "style", type: "select", options: ["noir", "vhs"], default: "noir" },
        { name: "count", type: "number", default: 1 },
      ],
    });
    expect(fields).toEqual([
      { key: "image_url", label: "Image", type: "url", required: true, options: [], defaultValue: "" },
      { key: "style", label: "style", type: "select", required: false, options: ["noir", "vhs"], defaultValue: "noir" },
      { key: "count", label: "count", type: "number", required: false, options: [], defaultValue: "1" },
    ]);
  });

  it("parses a dict-of-specs shape", () => {
    const fields = normalizeWorkflowInputs({
      prompt: { type: "string", required: true },
    });
    expect(fields).toEqual([
      { key: "prompt", label: "prompt", type: "text", required: true, options: [], defaultValue: "" },
    ]);
  });

  it("unknown field types degrade to text", () => {
    const fields = normalizeWorkflowInputs({ inputs: [{ name: "mystery", type: "wavelet" }] });
    expect(fields[0].type).toBe("text");
  });

  it("url-ish names become url fields even without a type", () => {
    const fields = normalizeWorkflowInputs({ inputs: [{ name: "video_url" }] });
    expect(fields[0].type).toBe("url");
  });

  it("garbage input yields an empty list", () => {
    expect(normalizeWorkflowInputs(null)).toEqual([]);
    expect(normalizeWorkflowInputs("nope")).toEqual([]);
    expect(normalizeWorkflowInputs({ inputs: "nope" })).toEqual([]);
  });
});
