import { getLatestHandoffs, type Handoff } from '@chat-template/db';

// How the console sees a chat's latest handoff. Never on customer routes.
function toHandoffView(h: Handoff) {
  const facts = h.facts ?? null;
  const verified = facts?.verified_data;
  return {
    reason: h.reason,
    summary: h.summary,
    verifiedData:
      verified && typeof verified === 'object'
        ? (verified as Record<string, unknown>)
        : null,
    facts,
    at: h.createdAt.toISOString(),
    resolvedAt: h.resolvedAt ? h.resolvedAt.toISOString() : null,
  };
}

// Adds handoff (the latest, or null) and hasHandoff (still open) to console
// chats, with one query for the whole list.
export async function withHandoffs<T extends { id: string }>(chats: T[]) {
  const latest = await getLatestHandoffs({ chatIds: chats.map((c) => c.id) });
  const byChat = new Map(latest.map((h) => [h.chatId, h]));
  return chats.map((c) => {
    const h = byChat.get(c.id);
    return {
      ...c,
      handoff: h ? toHandoffView(h) : null,
      hasHandoff: Boolean(h && !h.resolvedAt),
    };
  });
}

export async function withHandoff<T extends { id: string }>(chat: T) {
  const [withIt] = await withHandoffs([chat]);
  return withIt;
}
