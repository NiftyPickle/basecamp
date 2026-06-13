import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { FreeChatView, type FreeChatViewProps } from "./FreeChatView";
import type { OpenRouterInfo } from "@/lib/api";
import type { ChatMessage } from "@/lib/chat-reducer";

const infoNoKey: OpenRouterInfo = {
  key_present: false,
  free_models: [],
  council_available: false,
  council_default_models: [],
};
const infoWithKey: OpenRouterInfo = {
  key_present: true,
  free_models: ["meta-llama/llama-3.3-70b-instruct:free"],
  council_available: true,
  council_default_models: ["anthropic/claude-sonnet-4.5", "openai/gpt-5.1"],
};

function baseProps(overrides: Partial<FreeChatViewProps>): FreeChatViewProps {
  return {
    info: infoWithKey,
    loading: false,
    messages: [],
    council: false,
    draft: "",
    canSend: true,
    keyPresent: true,
    cloudModels: ["meta-llama/llama-3.3-70b-instruct:free"],
    localModels: [],
    localAvailable: true,
    selectedModel: "meta-llama/llama-3.3-70b-instruct:free",
    onModelChange: () => {},
    showDownloadPanel: false,
    localInfo: null,
    showOnboarding: false,
    onDownload: () => {},
    onDeleteLocal: () => {},
    onCloseDownloadPanel: () => {},
    onRecheckOnboarding: () => {},
    onRecheck: () => {},
    onToggleCouncil: () => {},
    onDraftChange: () => {},
    onSend: () => {},
    ...overrides,
  };
}

function render(props: FreeChatViewProps): string {
  return renderToString(createElement(FreeChatView, props));
}

function renderInto(props: FreeChatViewProps): HTMLDivElement {
  const host = document.createElement("div");
  host.innerHTML = render(props);
  return host;
}

describe("FreeChatView", () => {
  test("shows a loading state while info is null", () => {
    const out = render(baseProps({ info: null, loading: true }));
    expect(out.toLowerCase()).toContain("loading");
  });

  test("shows onboarding gate when no key and no local support", () => {
    const out = render(baseProps({ info: infoNoKey, localAvailable: false }));
    expect(out).toContain("openrouter.ai/keys");
    // no chat input when gated
    expect(out).not.toContain("data-testid=\"free-chat-input\"");
  });

  test("shows chat shell with council toggle when key present", () => {
    const out = render(baseProps({ info: infoWithKey }));
    expect(out).toContain("data-testid=\"free-chat-input\"");
    expect(out.toLowerCase()).toContain("council");
  });

  test("renders deliberation panel for assistant messages that carry one", () => {
    const messages: ChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        text: "VERDICT",
        streaming: false,
        tools: [],
        deliberation: {
          members: [{ model: "anthropic/claude-sonnet-4.5", answer: "x", critique: "y", ok: true }],
          synthesizer: "anthropic/claude-sonnet-4.5",
        },
      },
    ];
    const out = render(baseProps({ messages }));
    expect(out).toContain("VERDICT");
    expect(out).toContain("<details");
  });

  test("renders the model picker above the composer", () => {
    const container = renderInto(baseProps({}));
    expect(container.querySelector("[data-testid='model-picker']")).not.toBeNull();
  });

  test("model picker is disabled while council mode is on", () => {
    const container = renderInto(baseProps({ council: true }));
    const select = container.querySelector<HTMLSelectElement>("[data-testid='model-picker']")!;
    expect(select.disabled).toBe(true);
  });
});
