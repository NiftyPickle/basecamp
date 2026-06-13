import { describe, it, expect } from "vitest";
import { chatReducer, initialChatState } from "./chat-reducer";
import type { ChatState } from "./chat-reducer";

function feed(state: ChatState, frames: unknown[]): ChatState {
  return frames.reduce<ChatState>((s, f) => chatReducer(s, { kind: "frame", frame: f }), state);
}

describe("chatReducer", () => {
  it("appends a user message on send", () => {
    // Arrange
    const state = initialChatState();
    // Act
    const next = chatReducer(state, { kind: "user-send", text: "hello" });
    // Assert
    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toMatchObject({ role: "user", text: "hello" });
  });

  it("streams an assistant message from start/delta/complete frames", () => {
    // Arrange
    const state = initialChatState();
    // Act
    const next = feed(state, [
      { method: "event", params: { type: "message.start", session_id: "s1" } },
      { method: "event", params: { type: "message.delta", session_id: "s1", payload: { text: "Hel" } } },
      { method: "event", params: { type: "message.delta", session_id: "s1", payload: { text: "lo" } } },
      { method: "event", params: { type: "message.complete", session_id: "s1", payload: {} } },
    ]);
    // Assert
    const assistant = next.messages.filter((m) => m.role === "assistant");
    expect(assistant).toHaveLength(1);
    expect(assistant[0].text).toBe("Hello");
    expect(assistant[0].streaming).toBe(false);
  });

  it("prefers payload.text on complete when provided", () => {
    // Arrange
    const state = initialChatState();
    // Act
    const next = feed(state, [
      { method: "event", params: { type: "message.start", session_id: "s1" } },
      { method: "event", params: { type: "message.delta", session_id: "s1", payload: { text: "partial" } } },
      { method: "event", params: { type: "message.complete", session_id: "s1", payload: { text: "full final answer" } } },
    ]);
    // Assert
    expect(next.messages.at(-1)?.text).toBe("full final answer");
  });

  it("records a tool chip on tool.start and resolves it on tool.complete", () => {
    // Arrange
    const state = initialChatState();
    // Act
    const next = feed(state, [
      { method: "event", params: { type: "message.start", session_id: "s1" } },
      { method: "event", params: { type: "tool.start", session_id: "s1", payload: { tool_id: "t1", tool_name: "web_search" } } },
      { method: "event", params: { type: "tool.complete", session_id: "s1", payload: { tool_id: "t1" } } },
    ]);
    // Assert
    const assistant = next.messages.find((m) => m.role === "assistant");
    expect(assistant?.tools).toHaveLength(1);
    expect(assistant?.tools[0]).toMatchObject({ id: "t1", name: "web_search", done: true });
  });

  it("surfaces an error bubble on agent_error", () => {
    // Arrange
    const state = initialChatState();
    // Act
    const next = feed(state, [
      { method: "event", params: { type: "agent_error", session_id: "s1", payload: { message: "boom" } } },
    ]);
    // Assert
    expect(next.messages.at(-1)).toMatchObject({ role: "error", text: "boom" });
  });

  it("finalizes a streaming assistant message on agent_error", () => {
    // Arrange
    const state = initialChatState();
    // Act: backend emits message.start then agent_error without message.complete
    const next = feed(state, [
      { method: "event", params: { type: "message.start", session_id: "s1" } },
      { method: "event", params: { type: "message.delta", session_id: "s1", payload: { text: "partial" } } },
      { method: "event", params: { type: "agent_error", session_id: "s1", payload: { message: "boom" } } },
    ]);
    // Assert: error bubble appended AND the active assistant stops streaming
    expect(next.messages.at(-1)).toMatchObject({ role: "error", text: "boom" });
    const assistant = next.messages.find((m) => m.role === "assistant");
    expect(assistant?.streaming).toBe(false);
  });

  it("ignores malformed frames without throwing", () => {
    // Arrange
    const state = initialChatState();
    // Act
    const next = feed(state, [null, 42, {}, { method: "event" }, { method: "event", params: {} }]);
    // Assert
    expect(next.messages).toHaveLength(0);
  });
});

describe("load-history", () => {
  it("maps stored user + assistant messages into ChatMessage[]", () => {
    const state = initialChatState();
    const next = chatReducer(state, {
      kind: "load-history",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello there" },
      ],
    });
    expect(next.messages).toHaveLength(2);
    expect(next.messages[0]).toMatchObject({ role: "user", text: "hi", streaming: false });
    expect(next.messages[1]).toMatchObject({ role: "assistant", text: "hello there", streaming: false });
  });

  it("skips non user/assistant rows and null content", () => {
    const next = chatReducer(initialChatState(), {
      kind: "load-history",
      messages: [
        { role: "system", content: "ignore me" },
        { role: "tool", content: "tool output" },
        { role: "assistant", content: null },
        { role: "user", content: "kept" },
      ],
    });
    expect(next.messages.map((m) => m.text)).toEqual(["kept"]);
  });

  it("resets seq past the loaded count and clears streaming", () => {
    const next = chatReducer(initialChatState(), {
      kind: "load-history",
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ],
    });
    expect(next.seq).toBe(2);
    expect(next.messages.every((m) => m.streaming === false)).toBe(true);
  });
});
