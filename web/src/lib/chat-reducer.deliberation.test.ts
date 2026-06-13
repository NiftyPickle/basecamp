import { describe, expect, test } from "vitest";
import { chatReducer, initialChatState, type ChatState } from "./chat-reducer";

function startedAssistant(): ChatState {
  // user-send then message.start gives us a streaming assistant message
  let s = chatReducer(initialChatState(), { kind: "user-send", text: "q?" });
  s = chatReducer(s, { kind: "frame", frame: { method: "event", params: { type: "message.start", payload: {} } } });
  return s;
}

describe("chat-reducer deliberation", () => {
  test("message.complete stores deliberation blob on the assistant message", () => {
    let s = startedAssistant();
    const deliberation = {
      members: [
        { model: "anthropic/claude-sonnet-4.5", answer: "a1", critique: "c1", ok: true },
        { model: "openai/gpt-5.1", answer: null, critique: null, ok: false },
      ],
      synthesizer: "anthropic/claude-sonnet-4.5",
    };
    s = chatReducer(s, {
      kind: "frame",
      frame: { method: "event", params: { type: "message.complete", payload: { text: "VERDICT", deliberation } } },
    });
    const msg = s.messages[s.messages.length - 1];
    expect(msg.text).toBe("VERDICT");
    expect(msg.streaming).toBe(false);
    expect(msg.deliberation).toEqual(deliberation);
  });

  test("message.complete preserves backend-provided label fields", () => {
    let s = startedAssistant();
    const deliberation = {
      members: [
        { model: "anthropic/claude-sonnet-4.5", answer: "a1", critique: null, ok: true, label: "Claude" },
      ],
      synthesizer: "anthropic/claude-sonnet-4.5",
      synthesizer_label: "Claude",
    };
    s = chatReducer(s, {
      kind: "frame",
      frame: { method: "event", params: { type: "message.complete", payload: { text: "v", deliberation } } },
    });
    const msg = s.messages[s.messages.length - 1];
    expect(msg.deliberation?.members[0].label).toBe("Claude");
    expect(msg.deliberation?.synthesizer_label).toBe("Claude");
  });

  test("message.complete with malformed deliberation leaves field undefined", () => {
    // array blob
    let s = startedAssistant();
    s = chatReducer(s, {
      kind: "frame",
      frame: { method: "event", params: { type: "message.complete", payload: { text: "v", deliberation: [1, 2] } } },
    });
    expect(s.messages[s.messages.length - 1].deliberation).toBeUndefined();

    // object missing members
    let s2 = startedAssistant();
    s2 = chatReducer(s2, {
      kind: "frame",
      frame: {
        method: "event",
        params: { type: "message.complete", payload: { text: "v", deliberation: { synthesizer: "x" } } },
      },
    });
    expect(s2.messages[s2.messages.length - 1].deliberation).toBeUndefined();
  });

  test("message.complete without deliberation leaves field undefined", () => {
    let s = startedAssistant();
    s = chatReducer(s, {
      kind: "frame",
      frame: { method: "event", params: { type: "message.complete", payload: { text: "plain" } } },
    });
    const msg = s.messages[s.messages.length - 1];
    expect(msg.text).toBe("plain");
    expect(msg.deliberation).toBeUndefined();
  });
});
