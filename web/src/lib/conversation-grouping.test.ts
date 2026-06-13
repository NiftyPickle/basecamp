import { describe, it, expect } from "vitest";
import { groupConversations } from "./conversation-grouping";
import type { ConversationSummary, ChatGroup } from "./conversation-grouping";

const sessions: ConversationSummary[] = [
  { id: "s1", title: "First" },
  { id: "s2", title: "Second" },
  { id: "s3", title: "Third" },
];

describe("groupConversations", () => {
  it("places assigned sessions under their group, rest in ungrouped", () => {
    const groups: ChatGroup[] = [
      { id: "g1", name: "Work", position: 0, session_ids: ["s1"] },
    ];
    const result = groupConversations(sessions, groups);
    expect(result.groups[0].name).toBe("Work");
    expect(result.groups[0].conversations.map((c) => c.id)).toEqual(["s1"]);
    expect(result.ungrouped.map((c) => c.id)).toEqual(["s2", "s3"]);
  });

  it("orders groups by position", () => {
    const groups: ChatGroup[] = [
      { id: "g2", name: "B", position: 1, session_ids: [] },
      { id: "g1", name: "A", position: 0, session_ids: [] },
    ];
    const result = groupConversations(sessions, groups);
    expect(result.groups.map((g) => g.name)).toEqual(["A", "B"]);
  });

  it("ignores group member ids with no matching session", () => {
    const groups: ChatGroup[] = [
      { id: "g1", name: "Work", position: 0, session_ids: ["ghost", "s2"] },
    ];
    const result = groupConversations(sessions, groups);
    expect(result.groups[0].conversations.map((c) => c.id)).toEqual(["s2"]);
    expect(result.ungrouped.map((c) => c.id)).toEqual(["s1", "s3"]);
  });
});
