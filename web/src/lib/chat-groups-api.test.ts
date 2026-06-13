import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchJSON = vi.fn();
vi.mock("./api", () => ({ fetchJSON: (...args: unknown[]) => fetchJSON(...args) }));

import {
  listChatGroups,
  createChatGroup,
  renameChatGroup,
  deleteChatGroup,
  assignConversation,
  unassignConversation,
} from "./chat-groups-api";

beforeEach(() => fetchJSON.mockReset().mockResolvedValue({}));

describe("chat-groups-api", () => {
  it("listChatGroups GETs the collection", async () => {
    fetchJSON.mockResolvedValue({ groups: [] });
    const out = await listChatGroups();
    expect(fetchJSON).toHaveBeenCalledWith("/api/chat/groups");
    expect(out).toEqual([]);
  });

  it("createChatGroup POSTs the name", async () => {
    await createChatGroup("Work");
    expect(fetchJSON).toHaveBeenCalledWith(
      "/api/chat/groups",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Work" }) }),
    );
  });

  it("renameChatGroup PATCHes the group", async () => {
    await renameChatGroup("g1", "New");
    expect(fetchJSON).toHaveBeenCalledWith(
      "/api/chat/groups/g1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "New" }) }),
    );
  });

  it("deleteChatGroup DELETEs the group", async () => {
    await deleteChatGroup("g1");
    expect(fetchJSON).toHaveBeenCalledWith(
      "/api/chat/groups/g1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("assignConversation PUTs the member", async () => {
    await assignConversation("g1", "s1");
    expect(fetchJSON).toHaveBeenCalledWith(
      "/api/chat/groups/g1/members/s1",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("unassignConversation DELETEs the member", async () => {
    await unassignConversation("g1", "s1");
    expect(fetchJSON).toHaveBeenCalledWith(
      "/api/chat/groups/g1/members/s1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
