import { describe, expect, it } from 'vitest';

import { adminChatsKey, messageSummary, ownerLabel } from '@/lib/admin';
import type { ChatMessage } from '@chat-template/core';

const page = (ids: string[], hasMore: boolean) => ({
  chats: ids.map((id) => ({ id })) as never[],
  hasMore,
});

describe('adminChatsKey', () => {
  it('builds the first page, then pages before the last chat', () => {
    const key = adminChatsKey(null);
    expect(key(0, null)).toBe('/api/admin/chats?limit=20');
    expect(key(1, page(['a', 'b'], true))).toBe(
      '/api/admin/chats?limit=20&ending_before=b',
    );
  });

  it('stops when the previous page has no more', () => {
    expect(adminChatsKey(null)(1, page(['a'], false))).toBeNull();
  });

  it('adds the user filter', () => {
    expect(adminChatsKey('user-1')(0, null)).toBe(
      '/api/admin/chats?limit=20&userId=user-1',
    );
  });
});

describe('ownerLabel', () => {
  it('falls back to "Sin email" for chats without an owner email', () => {
    expect(ownerLabel(null)).toBe('Sin email');
    expect(ownerLabel(undefined)).toBe('Sin email');
    expect(ownerLabel('ana@banco.test')).toBe('ana@banco.test');
  });
});

describe('messageSummary', () => {
  it('joins the text and flags tool calls', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Tu saldo es ' },
        { type: 'tool-getBalance', toolCallId: 't1', state: 'output-available' },
        { type: 'text', text: '$100.' },
      ],
    } as unknown as ChatMessage;
    expect(messageSummary(message)).toEqual({
      text: 'Tu saldo es $100.',
      usedTools: true,
    });
  });
});
