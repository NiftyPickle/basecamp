// Thin fetchJSON wrappers for the chat-group REST API. Kept separate from
// the React components so the request shapes are unit-testable in node.

import { fetchJSON } from "./api";
import type { ChatGroup } from "./conversation-grouping";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function listChatGroups(): Promise<ChatGroup[]> {
  const out = await fetchJSON<{ groups: ChatGroup[] }>("/api/chat/groups");
  return out.groups ?? [];
}

export async function createChatGroup(name: string): Promise<ChatGroup> {
  return fetchJSON<ChatGroup>("/api/chat/groups", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export async function renameChatGroup(groupId: string, name: string): Promise<ChatGroup> {
  return fetchJSON<ChatGroup>(`/api/chat/groups/${groupId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export async function deleteChatGroup(groupId: string): Promise<void> {
  await fetchJSON(`/api/chat/groups/${groupId}`, { method: "DELETE" });
}

export async function assignConversation(groupId: string, sessionId: string): Promise<void> {
  await fetchJSON(`/api/chat/groups/${groupId}/members/${sessionId}`, { method: "PUT" });
}

export async function unassignConversation(groupId: string, sessionId: string): Promise<void> {
  await fetchJSON(`/api/chat/groups/${groupId}/members/${sessionId}`, { method: "DELETE" });
}
