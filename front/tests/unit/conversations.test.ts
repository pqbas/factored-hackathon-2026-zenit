import { describe, expect, it } from 'vitest';

import {
  filterConversations,
  formatListTime,
  getInitials,
  groupMessagesByDay,
  sortByLastMessage,
} from '@/lib/conversations';
import { MOCK_CONVERSATIONS, type MockConversation } from '@/mocks/conversations';

// Fixed reference point so "Hoy"/"Ayer" don't depend on the real clock.
// Built (and every fixture below) from local date components + toISOString,
// so the round trip through `new Date(iso)` is timezone-independent.
const NOW = new Date(2026, 8, 28, 12, 0, 0);

function localIso(day: number, hour = 9, minute = 0): string {
  return new Date(2026, 8, day, hour, minute, 0, 0).toISOString();
}

function conversationAt(
  customerId: string,
  name: string,
  sentAt: string,
): MockConversation {
  return {
    customerId,
    name,
    unread: 0,
    messages: [{ id: `${customerId}-1`, from: 'customer', text: 'hola', sentAt }],
  };
}

describe('getInitials', () => {
  it('returns two letters for a single-word name', () => {
    expect(getInitials('Ana')).toBe('AN');
  });

  it('returns first-and-last-word initials for multi-word names', () => {
    expect(getInitials('Santiago · México')).toBe('SM');
    expect(getInitials('Cliente cerrado')).toBe('CC');
  });
});

describe('filterConversations', () => {
  const conversations = [
    conversationAt('c1', 'Daniela · Argentina', localIso(28)),
    conversationAt('c2', 'Javier · Colombia', localIso(28)),
  ];

  it('matches regardless of case', () => {
    expect(filterConversations(conversations, 'DANIELA')).toHaveLength(1);
  });

  it('matches regardless of accents', () => {
    expect(filterConversations(conversations, 'argentina')).toHaveLength(1);
    expect(filterConversations(conversations, 'cólombia')).toHaveLength(1);
  });

  it('returns everything for an empty query', () => {
    expect(filterConversations(conversations, '  ')).toHaveLength(2);
  });
});

describe('sortByLastMessage', () => {
  it('puts the conversation with the most recent message first', () => {
    const older = conversationAt('c1', 'Older', localIso(26, 10));
    const newer = conversationAt('c2', 'Newer', localIso(27, 10));
    const sorted = sortByLastMessage([older, newer]);
    expect(sorted.map((c) => c.customerId)).toEqual(['c2', 'c1']);
  });
});

describe('groupMessagesByDay', () => {
  it('labels messages as Hoy, Ayer, and by date otherwise', () => {
    const messages = [
      { id: '1', from: 'customer' as const, text: 'a', sentAt: localIso(26) },
      { id: '2', from: 'customer' as const, text: 'b', sentAt: localIso(27) },
      { id: '3', from: 'agent' as const, text: 'c', sentAt: localIso(28) },
    ];
    const groups = groupMessagesByDay(messages, NOW);
    expect(groups.map((g) => g.label)).toEqual([
      '26 de septiembre',
      'Ayer',
      'Hoy',
    ]);
  });

  it('keeps consecutive same-day messages in a single group', () => {
    const messages = [
      { id: '1', from: 'customer' as const, text: 'a', sentAt: localIso(28, 8) },
      { id: '2', from: 'agent' as const, text: 'b', sentAt: localIso(28, 9) },
    ];
    const groups = groupMessagesByDay(messages, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages).toHaveLength(2);
  });
});

describe('formatListTime', () => {
  it('returns HH:mm for a message sent today', () => {
    expect(formatListTime(localIso(28, 9, 30), NOW)).toBe('09:30');
  });

  it('returns "Ayer" for a message sent yesterday', () => {
    expect(formatListTime(localIso(27, 9, 30), NOW)).toBe('Ayer');
  });

  it('returns dd/MM/yyyy for older messages', () => {
    expect(formatListTime(localIso(20, 9, 30), NOW)).toBe('20/09/2026');
  });
});

describe('MOCK_CONVERSATIONS', () => {
  it('has five demo clients, each with at least one message', () => {
    expect(MOCK_CONVERSATIONS).toHaveLength(5);
    for (const conversation of MOCK_CONVERSATIONS) {
      expect(conversation.messages.length).toBeGreaterThan(0);
    }
  });

  it('has at least one client with a message sent today', () => {
    const today = new Date();
    const hasTodayMessage = MOCK_CONVERSATIONS.some((conversation) =>
      conversation.messages.some((message) => {
        const date = new Date(message.sentAt);
        return (
          date.getFullYear() === today.getFullYear() &&
          date.getMonth() === today.getMonth() &&
          date.getDate() === today.getDate()
        );
      }),
    );
    expect(hasTodayMessage).toBe(true);
  });
});
