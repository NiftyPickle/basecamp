// Pure grouping logic for the conversation library panel. Given the flat
// session list (from GET /api/sessions) and the groups (from
// GET /api/chat/groups), produce ordered groups-with-conversations plus an
// ungrouped bucket. No React, no fetch - unit-tested in isolation.

export type ConversationSummary = {
  id: string;
  title: string | null;
};

export type ChatGroup = {
  id: string;
  name: string;
  position: number;
  session_ids: string[];
};

export type GroupedSection = {
  id: string;
  name: string;
  position: number;
  conversations: ConversationSummary[];
};

export type GroupedView = {
  groups: GroupedSection[];
  ungrouped: ConversationSummary[];
};

export function groupConversations(
  sessions: ConversationSummary[],
  groups: ChatGroup[],
): GroupedView {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const assigned = new Set<string>();

  const orderedGroups = [...groups].sort((a, b) => a.position - b.position);
  const sections: GroupedSection[] = orderedGroups.map((g) => {
    const conversations: ConversationSummary[] = [];
    for (const sid of g.session_ids) {
      const found = byId.get(sid);
      if (found) {
        conversations.push(found);
        assigned.add(sid);
      }
    }
    return { id: g.id, name: g.name, position: g.position, conversations };
  });

  const ungrouped = sessions.filter((s) => !assigned.has(s.id));
  return { groups: sections, ungrouped };
}
