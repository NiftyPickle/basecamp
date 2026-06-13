import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ChatSocket, makeBrowserSocketFactory, type SocketFactory } from "@/lib/chat-socket";
import {
  buildWsUrl,
  getOpenRouterInfo,
  getLocalModels,
  startLocalModelDownload,
  deleteLocalModel,
  type OpenRouterInfo,
  type LocalModelsInfo,
} from "@/lib/api";
import { chatReducer, initialChatState } from "@/lib/chat-reducer";
import { ADD_KEY_SENTINEL, DOWNLOAD_SENTINEL } from "@/components/chat/ModelPicker";
import { FreeChatView } from "./FreeChatView";

const RECONNECT_BACKOFF_INITIAL_MS = 500;
const RECONNECT_BACKOFF_MAX_MS = 10000;

const MODEL_STORAGE_KEY = "hermes.freechat.model";
const LOCAL_POLL_MS = 1000;

const LOCAL_INFO_FALLBACK: LocalModelsInfo = {
  available: false,
  detected_ram_gb: 0,
  free_disk_gb: 0,
  models: [],
};

function readStoredModel(): string | null {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export type FreeChatPageProps = {
  /** Test seam: replaces the browser WebSocket factory with an injected one. */
  socketFactory?: SocketFactory;
};

export function FreeChatPage({ socketFactory }: FreeChatPageProps) {
  const [info, setInfo] = useState<OpenRouterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [council, setCouncil] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(readStoredModel);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [state, dispatch] = useReducer(chatReducer, undefined, initialChatState);
  const [localInfo, setLocalInfo] = useState<LocalModelsInfo | null>(null);
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const socketRef = useRef<ChatSocket | null>(null);
  const sessionRef = useRef<string | null>(null);

  const loadInfo = useCallback(async () => {
    setLoading(true);
    try {
      setInfo(await getOpenRouterInfo());
    } catch {
      setInfo({ key_present: false, free_models: [], council_available: false, council_default_models: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  const loadLocalInfo = useCallback(async () => {
    try {
      setLocalInfo(await getLocalModels());
    } catch {
      setLocalInfo(LOCAL_INFO_FALLBACK);
    }
  }, []);

  useEffect(() => {
    void loadLocalInfo();
  }, [loadLocalInfo]);

  const isLocalBusy =
    localInfo?.models.some(
      (m) => m.state === "downloading" || m.state === "verifying",
    ) ?? false;

  useEffect(() => {
    if (!showDownloadPanel && !isLocalBusy) return;
    const timer = setInterval(() => {
      void loadLocalInfo();
    }, LOCAL_POLL_MS);
    return () => clearInterval(timer);
  }, [showDownloadPanel, isLocalBusy, loadLocalInfo]);

  // Fallback chain (spec): stored if still valid -> first cloud slug when a
  // key is present -> first installed local model -> null placeholder.
  useEffect(() => {
    if (!info || localInfo === null) return;
    const installed = localInfo.models.filter((m) => m.state === "installed");
    const isValid = (ref: string | null): boolean => {
      if (!ref) return false;
      if (ref.startsWith("local/")) {
        return installed.some((m) => `local/${m.id}` === ref);
      }
      return info.key_present && info.free_models.includes(ref);
    };
    setSelectedModel((current) => {
      if (isValid(current)) return current;
      if (info.key_present && info.free_models.length > 0) {
        return info.free_models[0];
      }
      if (installed.length > 0) return `local/${installed[0].id}`;
      return null;
    });
  }, [info, localInfo]);

  // Open the council socket once a key is present or a local model is available.
  // Reconnect with exponential backoff when it drops; the cancelled guard plus
  // timer cleanup stop the loop on unmount or key/local loss.
  useEffect(() => {
    if (!info) return;
    const localAvailable = localInfo?.available ?? false;
    if (!info.key_present && !localAvailable) return;
    let cancelled = false;
    let backoff = RECONNECT_BACKOFF_INITIAL_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    async function bringUp() {
      const url = await buildWsUrl("/api/council/ws");
      if (cancelled) return;
      const socket = new ChatSocket(socketFactory ?? makeBrowserSocketFactory(url));
      socketRef.current = socket;
      socket.onEvent((frame) => dispatch({ kind: "frame", frame }));
      socket.onOpen(() => {
        backoff = RECONNECT_BACKOFF_INITIAL_MS;
        setConnected(true);
      });
      socket.onClose(() => {
        if (cancelled) return;
        setConnected(false);
        reconnectTimer = setTimeout(() => void bringUp(), backoff);
        backoff = Math.min(backoff * 2, RECONNECT_BACKOFF_MAX_MS);
      });
      socket.connect();
    }

    void bringUp();
    return () => {
      cancelled = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
      sessionRef.current = null;
      setConnected(false);
    };
  }, [info?.key_present, localInfo?.available, socketFactory]);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    const socket = socketRef.current;
    if (!socket) return null;
    if (sessionRef.current) return sessionRef.current;
    try {
      const res = (await socket.request("session.create", {})) as { session_id?: string };
      const sessionId = res?.session_id ?? null;
      sessionRef.current = sessionId;
      return sessionId;
    } catch {
      return null;
    }
  }, []);

  const onModelChange = useCallback((value: string) => {
    if (value === DOWNLOAD_SENTINEL) {
      setShowDownloadPanel(true);
      return;
    }
    if (value === ADD_KEY_SENTINEL) {
      setShowOnboarding(true);
      return;
    }
    setSelectedModel(value);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, value);
    } catch {
      /* storage unavailable - selection still applies for this session */
    }
  }, []);

  const onDownload = useCallback(
    (id: string) => {
      void startLocalModelDownload(id)
        .catch(() => {
          /* 409/404 surface via the next poll's error state */
        })
        .finally(() => void loadLocalInfo());
    },
    [loadLocalInfo],
  );

  const onDeleteLocal = useCallback(
    (id: string) => {
      // Spec: delete requires confirm before removing the gguf from disk.
      if (!window.confirm("Delete this model from disk?")) return;
      void deleteLocalModel(id)
        .catch(() => {
          /* already gone - poll will reconcile */
        })
        .finally(() => void loadLocalInfo());
    },
    [loadLocalInfo],
  );

  const onRecheckFromOnboarding = useCallback(() => {
    setShowOnboarding(false);
    void loadInfo();
  }, [loadInfo]);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    const socket = socketRef.current;
    if (!text || !connected || !socket) return;
    setDraft("");
    dispatch({ kind: "user-send", text });
    const sessionId = await ensureSession();
    if (!sessionId) {
      // Give the user their message back so a retry is one click away.
      setDraft(text);
      dispatch({
        kind: "frame",
        frame: { method: "event", params: { type: "agent_error", payload: { message: "Could not start a session." } } },
      });
      return;
    }
    const params: Record<string, unknown> = { session_id: sessionId, text, council };
    if (!council && selectedModel) {
      params.models = [selectedModel];
    }
    socket.request("prompt.submit", params).catch(() => {
      dispatch({
        kind: "frame",
        frame: { method: "event", params: { type: "agent_error", payload: { message: "Failed to send. Reconnecting." } } },
      });
    });
  }, [draft, connected, council, selectedModel, ensureSession]);

  const lastMessage = state.messages[state.messages.length - 1];
  const streaming = lastMessage?.streaming ?? false;
  const canSend =
    connected &&
    draft.trim().length > 0 &&
    !streaming &&
    (council || selectedModel !== null);

  return (
    <FreeChatView
      info={info}
      loading={loading}
      messages={state.messages}
      council={council}
      draft={draft}
      canSend={canSend}
      keyPresent={info?.key_present ?? false}
      cloudModels={info?.free_models ?? []}
      localModels={(localInfo?.models ?? [])
        .filter((m) => m.state === "installed")
        .map((m) => ({ id: m.id, label: m.label }))}
      localAvailable={localInfo?.available ?? false}
      selectedModel={selectedModel}
      onModelChange={onModelChange}
      showDownloadPanel={showDownloadPanel}
      localInfo={localInfo}
      showOnboarding={showOnboarding}
      onDownload={onDownload}
      onDeleteLocal={onDeleteLocal}
      onCloseDownloadPanel={() => setShowDownloadPanel(false)}
      onRecheckOnboarding={onRecheckFromOnboarding}
      onRecheck={() => void loadInfo()}
      onToggleCouncil={setCouncil}
      onDraftChange={setDraft}
      onSend={() => void onSend()}
    />
  );
}
