// Pure state machine for the Sidekick simple chat. No React, no sockets — maps
// gateway event frames + local user actions to a flat message list so it can be
// unit-tested in isolation.

export type ToolChip = { id: string; name: string; done: boolean };

export type DeliberationMember = {
  model: string;
  answer: string | null;
  critique: string | null;
  ok: boolean;
  /** Friendly display label provided by the backend; derive from model if absent. */
  label?: string;
};

export type Deliberation = {
  members: DeliberationMember[];
  synthesizer: string;
  /** Friendly display label for the synthesizer; derive from synthesizer if absent. */
  synthesizer_label?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  streaming: boolean;
  tools: ToolChip[];
  deliberation?: Deliberation;
};

export type StoredMessage = {
  role: string;
  content: string | null;
};

export type ChatState = {
  messages: ChatMessage[];
  seq: number;
};

export type ChatAction =
  | { kind: "user-send"; text: string }
  | { kind: "frame"; frame: unknown }
  | { kind: "load-history"; messages: StoredMessage[] };

export function initialChatState(): ChatState {
  return { messages: [], seq: 0 };
}

function nextId(state: ChatState): [string, number] {
  const seq = state.seq + 1;
  return [`m${seq}`, seq];
}

type EventParams = { type: string; session_id?: string; payload?: Record<string, unknown> };

function readEvent(frame: unknown): EventParams | null {
  if (!frame || typeof frame !== "object") return null;
  const f = frame as Record<string, unknown>;
  if (f.method !== "event") return null;
  const params = f.params;
  if (!params || typeof params !== "object") return null;
  const p = params as Record<string, unknown>;
  if (typeof p.type !== "string") return null;
  return { type: p.type, payload: (p.payload as Record<string, unknown>) ?? {} };
}

function activeAssistant(state: ChatState): ChatMessage | undefined {
  return [...state.messages].reverse().find((m) => m.role === "assistant" && m.streaming);
}

function replaceMessage(state: ChatState, id: string, patch: Partial<ChatMessage>): ChatState {
  return {
    ...state,
    messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.kind === "load-history") {
    const messages: ChatMessage[] = [];
    let seq = 0;
    for (const stored of action.messages) {
      if (stored.role !== "user" && stored.role !== "assistant") continue;
      if (typeof stored.content !== "string" || stored.content.length === 0) continue;
      seq += 1;
      messages.push({
        id: `m${seq}`,
        role: stored.role,
        text: stored.content,
        streaming: false,
        tools: [],
      });
    }
    return { messages, seq };
  }

  if (action.kind === "user-send") {
    const [id, seq] = nextId(state);
    const msg: ChatMessage = { id, role: "user", text: action.text, streaming: false, tools: [] };
    return { messages: [...state.messages, msg], seq };
  }

  const evt = readEvent(action.frame);
  if (!evt) return state;
  const payload = evt.payload ?? {};

  switch (evt.type) {
    case "message.start": {
      const [id, seq] = nextId(state);
      const msg: ChatMessage = { id, role: "assistant", text: "", streaming: true, tools: [] };
      return { messages: [...state.messages, msg], seq };
    }
    case "message.delta": {
      const active = activeAssistant(state);
      if (!active) return state;
      const text = typeof payload.text === "string" ? payload.text : "";
      return replaceMessage(state, active.id, { text: active.text + text });
    }
    case "message.complete": {
      const active = activeAssistant(state);
      if (!active) return state;
      const finalText = typeof payload.text === "string" ? payload.text : active.text;
      const patch: Partial<ChatMessage> = { text: finalText, streaming: false };
      const deliberation = payload.deliberation;
      if (
        deliberation &&
        typeof deliberation === "object" &&
        !Array.isArray(deliberation) &&
        Array.isArray((deliberation as Deliberation).members)
      ) {
        patch.deliberation = deliberation as Deliberation;
      }
      return replaceMessage(state, active.id, patch);
    }
    case "tool.start": {
      const active = activeAssistant(state);
      if (!active) return state;
      const id = typeof payload.tool_id === "string" ? payload.tool_id : `tool${state.seq}`;
      const name = typeof payload.tool_name === "string" ? payload.tool_name : "tool";
      return replaceMessage(state, active.id, { tools: [...active.tools, { id, name, done: false }] });
    }
    case "tool.complete": {
      const active = activeAssistant(state);
      if (!active) return state;
      const id = typeof payload.tool_id === "string" ? payload.tool_id : "";
      return replaceMessage(state, active.id, {
        tools: active.tools.map((t) => (t.id === id ? { ...t, done: true } : t)),
      });
    }
    case "agent_error": {
      const [id, seq] = nextId(state);
      const text = typeof payload.message === "string" ? payload.message : "Agent error";
      const msg: ChatMessage = { id, role: "error", text, streaming: false, tools: [] };
      // Finalize any in-flight assistant message: an error ends the turn, and
      // a stuck streaming flag would wedge senders that gate on it.
      const active = activeAssistant(state);
      const messages = active
        ? state.messages.map((m) => (m.id === active.id ? { ...m, streaming: false } : m))
        : state.messages;
      return { messages: [...messages, msg], seq };
    }
    default:
      return state;
  }
}
