import { useEffect, useRef } from "react";
import type { OpenRouterInfo, LocalModelsInfo } from "@/lib/api";
import type { ChatMessage } from "@/lib/chat-reducer";
import { OpenRouterOnboarding } from "@/components/OpenRouterOnboarding";
import { CouncilToggle } from "@/components/chat/CouncilToggle";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { DownloadPanel } from "@/components/chat/DownloadPanel";
import { DeliberationPanel } from "@/components/chat/DeliberationPanel";
import { renderInlineMarkdown } from "@/lib/render-inline-markdown";

export type FreeChatViewProps = {
  info: OpenRouterInfo | null;
  loading: boolean;
  messages: ChatMessage[];
  council: boolean;
  draft: string;
  canSend: boolean;
  keyPresent: boolean;
  cloudModels: string[];
  localModels: { id: string; label: string }[];
  localAvailable: boolean;
  selectedModel: string | null;
  onModelChange: (model: string) => void;
  showDownloadPanel: boolean;
  localInfo: LocalModelsInfo | null;
  showOnboarding: boolean;
  onDownload: (id: string) => void;
  onDeleteLocal: (id: string) => void;
  onCloseDownloadPanel: () => void;
  onRecheckOnboarding: () => void;
  onRecheck: () => void;
  onToggleCouncil: (next: boolean) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
};

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isError = message.role === "error";
  return (
    <div className={"flex flex-col " + (isUser ? "items-end" : "items-start")}>
      <div
        className={
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm " +
          (isUser
            ? "bg-[#5865F2] text-white"
            : isError
              ? "bg-red-900/30 text-red-200"
              : "bg-black/25 text-[#e7e3f4]")
        }
      >
        {isUser ? message.text : renderInlineMarkdown(message.text)}
      </div>
      {message.deliberation && <DeliberationPanel deliberation={message.deliberation} />}
    </div>
  );
}

export function FreeChatView(props: FreeChatViewProps) {
  const { info, loading, messages } = props;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest message in view as the list grows or streams.
  // Optional call: jsdom does not implement Element.scrollTo.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (loading || info === null) {
    return (
      <div className="mt-20 text-center text-sm text-[#9b95bd]">Loading Free chat...</div>
    );
  }

  if (!info.key_present && !props.localAvailable) {
    return <OpenRouterOnboarding onRecheck={props.onRecheck} />;
  }

  if (props.showOnboarding) {
    return (
      <div className="flex h-full flex-col">
        <button
          type="button"
          data-testid="onboarding-back"
          onClick={props.onRecheckOnboarding}
          className="self-start px-4 py-2 text-xs text-[#9b95bd]"
        >
          Back to chat
        </button>
        <OpenRouterOnboarding onRecheck={props.onRecheckOnboarding} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col" data-tour="freechat">
      <div className="flex items-center justify-between border-b border-black/20 px-4 py-2">
        <span className="text-xs text-[#9b95bd]">
          {props.council ? "Council deliberation (paid models)" : "Free chat"}
        </span>
        <CouncilToggle
          checked={props.council}
          available={info.council_available}
          onChange={props.onToggleCouncil}
        />
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {props.messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
      </div>

      <div className="flex items-center justify-end border-t border-black/20 px-4 pt-2">
        <ModelPicker
          cloudModels={props.cloudModels}
          keyPresent={props.keyPresent}
          localModels={props.localModels}
          localAvailable={props.localAvailable}
          selected={props.selectedModel}
          disabled={props.council}
          onChange={props.onModelChange}
        />
      </div>

      {props.showDownloadPanel && props.localInfo && (
        <DownloadPanel
          info={props.localInfo}
          onDownload={props.onDownload}
          onDelete={props.onDeleteLocal}
          onClose={props.onCloseDownloadPanel}
        />
      )}

      {props.selectedModel === null && !props.council && (
        <p className="px-4 pb-1 text-xs text-[#9b95bd]">
          Choose a model above - download a local model or add an OpenRouter key.
        </p>
      )}

      <form
        className="flex items-end gap-2 border-t border-black/20 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (props.canSend) props.onSend();
        }}
      >
        <textarea
          data-testid="free-chat-input"
          value={props.draft}
          onChange={(e) => props.onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (props.canSend) props.onSend();
            }
          }}
          rows={1}
          placeholder={props.council ? "Ask the council..." : "Message free chat..."}
          className="flex-1 resize-none rounded-xl bg-black/25 px-3 py-2 text-sm text-[#e7e3f4] outline-none placeholder:text-[#6b6589]"
        />
        <button
          type="submit"
          disabled={!props.canSend}
          className="rounded-xl bg-[#5865F2] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
