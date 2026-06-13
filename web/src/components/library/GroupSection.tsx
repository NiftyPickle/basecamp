import { useState } from "react";
import type { ConversationSummary } from "@/lib/conversation-grouping";
import { ConversationCard } from "./ConversationCard";

export function GroupSection({
  groupId,
  name,
  conversations,
  activeId,
  onOpen,
  onDragStart,
  onDropConversation,
  onRename,
  onDelete,
}: {
  groupId: string | null;
  name: string;
  conversations: ConversationSummary[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onDragStart: (id: string) => void;
  onDropConversation: (groupId: string | null, sessionId: string) => void;
  onRename?: (groupId: string) => void;
  onDelete?: (groupId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const sid = e.dataTransfer.getData("text/plain");
        if (sid) onDropConversation(groupId, sid);
      }}
      className={
        "rounded-xl border p-2 " +
        (dragOver ? "border-[#5865F2] bg-[#5865F2]/10" : "border-black/20")
      }
    >
      <div className="flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 truncate text-left text-xs font-semibold uppercase tracking-wide text-white/50"
        >
          {open ? "▾" : "▸"} {name}{" "}
          <span className="text-white/30">({conversations.length})</span>
        </button>
        {onRename && groupId && (
          <button
            type="button"
            onClick={() => onRename(groupId)}
            className="rounded px-1 text-xs text-white/40 hover:text-white/80"
            title="Rename group"
          >
            {"✎"}
          </button>
        )}
        {onDelete && groupId && (
          <button
            type="button"
            onClick={() => onDelete(groupId)}
            className="rounded px-1 text-xs text-white/40 hover:text-red-300"
            title="Delete group"
          >
            {"✕"}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-1 space-y-1">
          {conversations.length === 0 ? (
            <div className="px-3 py-2 text-xs text-white/30">
              Drop a conversation here
            </div>
          ) : (
            conversations.map((c) => (
              <ConversationCard
                key={c.id}
                conversation={c}
                active={c.id === activeId}
                onOpen={onOpen}
                onDragStart={onDragStart}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
