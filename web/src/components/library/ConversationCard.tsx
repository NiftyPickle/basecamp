import type { ConversationSummary } from "@/lib/conversation-grouping";

export function ConversationCard({
  conversation,
  active,
  onOpen,
  onDragStart,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onOpen: (id: string) => void;
  onDragStart: (id: string) => void;
}) {
  const label = conversation.title?.trim() || "Untitled conversation";
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", conversation.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(conversation.id);
      }}
      onClick={() => onOpen(conversation.id)}
      className={
        "block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors " +
        (active
          ? "bg-[#5865F2] text-white"
          : "bg-[#2b2640] text-[#dcd8ec] hover:bg-[#383052]")
      }
      title={label}
    >
      {label}
    </button>
  );
}
