import { api } from "@/core/api";

export type ChatMessage = { id: string; userId: string | null; name: string | null; body: string; deleted: boolean; mine: boolean; createdAt: string };
type Page = { messages: ChatMessage[]; hasMore: boolean };

const base = (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}/chat`;

export const chatApi = {
  latest: (groupId: string) => api<Page>(base(groupId)),
  after: (groupId: string, after: string) => api<Page>(`${base(groupId)}?after=${encodeURIComponent(after)}`),
  before: (groupId: string, before: string) => api<Page>(`${base(groupId)}?before=${encodeURIComponent(before)}`),
  send: (groupId: string, body: string) => api<ChatMessage>(base(groupId), { body: { body } }),
  remove: (messageId: string) => api<{ ok: true }>(`/api/chat/${encodeURIComponent(messageId)}`, { method: "DELETE" }),
};

/** Merge messages by id and keep them oldest first. */
export function mergeMessages(a: ChatMessage[], b: ChatMessage[]) {
  const byId = new Map(a.map((m) => [m.id, m]));
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
}
