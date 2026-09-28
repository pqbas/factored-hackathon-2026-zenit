// Helpers for the admin view (GET /api/admin/*). The admin reads every
// conversation through these routes only, never /api/chat/:id, which hides
// other users' private chats.

import type { Chat } from '@chat-template/db';
import type { ChatMessage } from '@chat-template/core';

export const ADMIN_PAGE_SIZE = 20;

export interface AdminChatPage {
  chats: Chat[];
  hasMore: boolean;
}

export interface ChatOwner {
  userId: string;
  userEmail: string | null;
}

export class AdminForbiddenError extends Error {
  constructor() {
    super('forbidden');
  }
}

// 403 throws AdminForbiddenError; 204 (no database) resolves to null.
export async function adminFetch<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { credentials: 'include' });
  if (response.status === 403) throw new AdminForbiddenError();
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

// useSWRInfinite key, paged like the chat history: each page starts before
// the last chat of the previous one.
export function adminChatsKey(userId: string | null) {
  return (pageIndex: number, previousPage: AdminChatPage | null) => {
    if (previousPage && !previousPage.hasMore) return null;
    const params = new URLSearchParams({ limit: String(ADMIN_PAGE_SIZE) });
    if (userId) params.set('userId', userId);
    if (pageIndex > 0) {
      const last = previousPage?.chats.at(-1);
      if (!last) return null;
      params.set('ending_before', last.id);
    }
    return `/api/admin/chats?${params.toString()}`;
  };
}

// Chats saved before the back stored emails have none.
export function ownerLabel(email: string | null | undefined): string {
  return email || 'Sin email';
}

export function messageSummary(message: ChatMessage): {
  text: string;
  usedTools: boolean;
} {
  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { text: string }).text)
    .join('');
  const usedTools = message.parts.some(
    (part) => part.type.startsWith('tool-') || part.type === 'dynamic-tool',
  );
  return { text, usedTools };
}
