import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJSON } from "@/lib/api";
import {
  groupConversations,
  type ChatGroup,
  type ConversationSummary,
} from "@/lib/conversation-grouping";
import {
  listChatGroups,
  createChatGroup,
  renameChatGroup,
  deleteChatGroup,
  assignConversation,
  unassignConversation,
} from "@/lib/chat-groups-api";
import { GroupSection } from "./GroupSection";

type SessionsResponse = { sessions: { id: string; title: string | null }[] };

export function ConversationLibrary({
  activeId,
  onOpen,
  refreshKey,
}: {
  activeId: string | null;
  onOpen: (id: string) => void;
  refreshKey: number;
}) {
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [sessRes, grp] = await Promise.all([
        fetchJSON<SessionsResponse>("/api/sessions"),
        listChatGroups(),
      ]);
      setSessions((sessRes.sessions ?? []).map((s) => ({ id: s.id, title: s.title })));
      setGroups(grp);
      setError(null);
    } catch {
      setError("Could not load conversations");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const view = useMemo(() => groupConversations(sessions, groups), [sessions, groups]);

  async function onCreateGroup() {
    const name = newName.trim();
    if (!name) return;
    try {
      await createChatGroup(name);
      setNewName("");
      await reload();
    } catch {
      setError("Could not create group");
    }
  }

  const onDropConversation = useCallback(
    async (groupId: string | null, sessionId: string) => {
      try {
        if (groupId === null) {
          // Dropped on the ungrouped bucket: remove from whatever group it is in.
          const owner = groups.find((g) => g.session_ids.includes(sessionId));
          if (owner) await unassignConversation(owner.id, sessionId);
        } else {
          await assignConversation(groupId, sessionId);
        }
        await reload();
      } catch {
        setError("Could not move conversation");
        await reload();
      }
    },
    [groups, reload],
  );

  async function onRename(groupId: string) {
    const next = window.prompt("Rename group");
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    try {
      await renameChatGroup(groupId, trimmed);
      await reload();
    } catch {
      setError("Could not rename group");
    }
  }

  async function onDelete(groupId: string) {
    if (!window.confirm("Delete this group? Conversations move to Ungrouped.")) return;
    try {
      await deleteChatGroup(groupId);
      await reload();
    } catch {
      setError("Could not delete group");
    }
  }

  const noop = useCallback(() => {}, []);

  return (
    <aside className="flex h-full w-72 flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#221d3a]">
      <div className="border-b border-black/20 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
          Conversations
        </div>
        <div className="flex gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreateGroup();
            }}
            placeholder="New group"
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-[#16122a] px-2 py-1.5 text-sm text-[#dcd8ec] placeholder:text-[#8b86a6] outline-none focus:border-[#5865F2]"
          />
          <button
            type="button"
            onClick={onCreateGroup}
            className="rounded-lg bg-[#5865F2] px-2 py-1.5 text-sm text-white hover:bg-[#4752C4]"
          >
            +
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {view.groups.map((g) => (
          <GroupSection
            key={g.id}
            groupId={g.id}
            name={g.name}
            conversations={g.conversations}
            activeId={activeId}
            onOpen={onOpen}
            onDragStart={noop}
            onDropConversation={onDropConversation}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
        <GroupSection
          groupId={null}
          name="Ungrouped"
          conversations={view.ungrouped}
          activeId={activeId}
          onOpen={onOpen}
          onDragStart={noop}
          onDropConversation={onDropConversation}
        />
      </div>
    </aside>
  );
}
