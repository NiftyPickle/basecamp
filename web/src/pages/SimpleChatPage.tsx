import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { buildWsUrl, fetchJSON, type ModelInfoResponse } from "@/lib/api";
import { ChatSocket } from "@/lib/chat-socket";
import { chatReducer, initialChatState, type StoredMessage } from "@/lib/chat-reducer";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { Composer } from "@/components/chat/Composer";
import { ConversationLibrary } from "@/components/library/ConversationLibrary";

type ConnState = "connecting" | "ready" | "reconnecting";

const PANEL_KEY = "basecamp.library.open";

export default function SimpleChatPage() {
  const [state, dispatch] = useReducer(chatReducer, undefined, initialChatState);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(PANEL_KEY) !== "0";
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const socketRef = useRef<ChatSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the ref in sync so socket callbacks read the latest id.
  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    let cancelled = false;
    let backoff = 500;

    async function bringUp() {
      const url = await buildWsUrl("/api/ws");
      if (cancelled) return;

      const socket = new ChatSocket(() => {
        const ws = new WebSocket(url);
        const adapter = {
          onopen: null as (() => void) | null,
          onmessage: null as ((data: string) => void) | null,
          onclose: null as (() => void) | null,
          send: (d: string) => ws.send(d),
          close: () => ws.close(),
        };
        ws.onopen = () => adapter.onopen?.();
        ws.onclose = () => adapter.onclose?.();
        ws.onmessage = (e) => adapter.onmessage?.(typeof e.data === "string" ? e.data : "");
        return adapter;
      });
      socketRef.current = socket;
      socket.onEvent((frame) => dispatch({ kind: "frame", frame }));
      socket.onClose(() => {
        if (cancelled) return;
        setConn("reconnecting");
        setTimeout(bringUp, backoff);
        backoff = Math.min(backoff * 2, 10000);
      });
      socket.onOpen(async () => {
        // Do NOT auto-create a session. The socket is ready; a session is
        // created lazily on first send, or attached on resume.
        backoff = 500;
        setConn("ready");
        // If we were already attached to a conversation, re-attach it.
        const sid = sessionIdRef.current;
        if (sid) {
          try {
            await socket.request("session.resume", { session_id: sid });
          } catch {
            /* leave as-is; a fresh send will create a new session */
          }
        }
      });
      socket.connect();
    }

    bringUp();
    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.messages]);

  useEffect(() => {
    const prev = document.title;
    document.title = "Basecamp";
    return () => {
      document.title = prev;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PANEL_KEY, panelOpen ? "1" : "0");
    }
  }, [panelOpen]);

  // Surface which model the agent is running so it is visible in the chat UI.
  useEffect(() => {
    let cancelled = false;
    fetchJSON<ModelInfoResponse>("/api/model/info")
      .then((info) => {
        if (!cancelled) setModelInfo(info);
      })
      .catch(() => {
        /* non-fatal; just leave the badge hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Short, human-friendly model label (drop any "provider/" prefix).
  const modelLabel = useMemo(() => {
    const raw = modelInfo?.model?.trim();
    if (!raw) return null;
    const slash = raw.lastIndexOf("/");
    return slash >= 0 ? raw.slice(slash + 1) : raw;
  }, [modelInfo]);

  async function ensureSession(): Promise<string | null> {
    const socket = socketRef.current;
    if (!socket) return null;
    if (sessionIdRef.current) return sessionIdRef.current;
    try {
      const res = (await socket.request("session.create", {})) as { session_id?: string };
      const sid = res?.session_id ?? null;
      setCurrentSessionId(sid);
      return sid;
    } catch {
      return null;
    }
  }

  async function onSend(text: string) {
    const socket = socketRef.current;
    if (!socket) return;
    const sid = await ensureSession();
    if (!sid) {
      dispatch({
        kind: "frame",
        frame: { method: "event", params: { type: "agent_error", payload: { message: "Could not start a session." } } },
      });
      return;
    }
    dispatch({ kind: "user-send", text });
    socket.request("prompt.submit", { session_id: sid, text }).catch(() => {
      dispatch({
        kind: "frame",
        frame: { method: "event", params: { type: "agent_error", payload: { message: "Failed to send. Reconnecting." } } },
      });
    });
    // A brand-new conversation may not appear in the library until its first
    // message persists; refresh the panel.
    setRefreshKey((k) => k + 1);
  }

  function onNewChat() {
    setCurrentSessionId(null);
    sessionIdRef.current = null;
    dispatch({ kind: "load-history", messages: [] });
  }

  const onOpenConversation = useCallback(async (id: string) => {
    const socket = socketRef.current;
    try {
      const res = await fetchJSON<{ session_id: string; messages: StoredMessage[] }>(
        `/api/sessions/${id}/messages`,
      );
      dispatch({ kind: "load-history", messages: res.messages ?? [] });
      setCurrentSessionId(res.session_id ?? id);
      sessionIdRef.current = res.session_id ?? id;
      if (socket) {
        await socket.request("session.resume", { session_id: res.session_id ?? id });
      }
    } catch {
      dispatch({
        kind: "frame",
        frame: { method: "event", params: { type: "agent_error", payload: { message: "Could not open that conversation." } } },
      });
    }
  }, []);

  const pill = useMemo(() => {
    if (conn === "ready") return null;
    return (
      <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-200">
        {conn === "connecting" ? "Connecting" : "Reconnecting"}
      </div>
    );
  }, [conn]);

  return (
    <div className="flex h-full gap-2 bg-transparent p-2">
      <div className="relative flex h-full flex-1 flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#241f38]">
        {pill}
        <div className="flex items-center justify-between border-b border-black/30 px-4 py-2">
          <button
            type="button"
            onClick={onNewChat}
            className="rounded-lg bg-[#5865F2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4752C4]"
          >
            New chat
          </button>
          {modelLabel && (
            <span
              title={modelInfo?.provider ? `${modelInfo.provider} / ${modelInfo?.model}` : modelInfo?.model}
              className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-white/60"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {modelLabel}
            </span>
          )}
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="rounded-lg px-3 py-1.5 text-sm text-white/60 hover:text-white"
          >
            {panelOpen ? "Hide library" : "Show library"}
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {state.messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-white/40">
              <div>
                <div className="text-lg font-medium text-white/70">Basecamp</div>
                <div className="mt-1 text-sm">Your AI employee. Ask anything to get started.</div>
              </div>
            </div>
          ) : (
            state.messages.map((m) => <ChatBubble key={m.id} message={m} />)
          )}
        </div>
        <Composer disabled={conn !== "ready"} onSend={onSend} />
      </div>
      {panelOpen && (
        <ConversationLibrary
          activeId={currentSessionId}
          onOpen={onOpenConversation}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}
