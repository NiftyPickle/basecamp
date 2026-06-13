import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { DeliberationPanel } from "./DeliberationPanel";
import type { Deliberation } from "@/lib/chat-reducer";

function render(deliberation: Deliberation): string {
  return renderToString(createElement(DeliberationPanel, { deliberation }));
}

describe("DeliberationPanel", () => {
  const deliberation: Deliberation = {
    members: [
      { model: "anthropic/claude-sonnet-4.5", answer: "claude answer", critique: "claude critique", ok: true },
      { model: "openai/gpt-5.1", answer: "gpt answer", critique: null, ok: true },
      { model: "google/gemini-2.5-pro", answer: null, critique: null, ok: false },
    ],
    synthesizer: "anthropic/claude-sonnet-4.5",
  };

  test("renders a collapsible summary", () => {
    const out = render(deliberation);
    expect(out).toContain("<details");
    expect(out.toLowerCase()).toContain("deliberation");
  });

  test("renders each member's answer and critique", () => {
    const out = render(deliberation);
    expect(out).toContain("claude answer");
    expect(out).toContain("claude critique");
    expect(out).toContain("gpt answer");
  });

  test("marks failed members", () => {
    const out = render(deliberation);
    // failed member's friendly label present and flagged
    expect(out.toLowerCase()).toContain("unavailable");
  });

  test("renders backend-provided labels when present", () => {
    const labeled: Deliberation = {
      members: [
        { model: "anthropic/claude-sonnet-4.5", answer: "a", critique: null, ok: true, label: "Claude" },
        { model: "someorg/mystery-model", answer: "b", critique: null, ok: true, label: "Mystery" },
      ],
      synthesizer: "anthropic/claude-sonnet-4.5",
      synthesizer_label: "Claude",
    };
    const out = render(labeled);
    expect(out).toContain("Claude");
    expect(out).toContain("Mystery");
    expect(out).not.toContain("mystery-model");
  });

  test("falls back to slug tail when labels are absent", () => {
    const unlabeled: Deliberation = {
      members: [
        { model: "someorg/mystery-model:free", answer: "a", critique: null, ok: true },
      ],
      synthesizer: "otherorg/chair-model",
    };
    const out = render(unlabeled);
    expect(out).toContain("mystery-model");
    expect(out).not.toContain(":free");
    expect(out).toContain("chair-model");
  });
});
