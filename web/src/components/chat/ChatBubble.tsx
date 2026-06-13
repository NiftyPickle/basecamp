import type { ChatMessage } from "@/lib/chat-reducer";
import { renderInlineMarkdown } from "@/lib/render-inline-markdown";
import { ToolChip } from "./ToolChip";

const ROLE_STYLES: Record<ChatMessage["role"], string> = {
  user: "ml-auto bg-[#5865F2] text-white",
  assistant: "mr-auto bg-[#322c4a] text-[#dcd8ec] border border-black/20",
  error: "mr-auto bg-red-900/40 text-red-200 border border-red-500/30",
};

export function ChatBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex w-full">
      <div className={"max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap " + ROLE_STYLES[message.role]}>
        {message.text
          ? renderInlineMarkdown(message.text)
          : message.streaming
            ? "…"
            : ""}
        {message.tools.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.tools.map((t) => (
              <ToolChip key={t.id} tool={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
