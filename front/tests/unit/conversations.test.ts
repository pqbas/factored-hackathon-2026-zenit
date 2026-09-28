import { describe, expect, it } from 'vitest';

import {
  conversationStatus,
  countByStatus,
  filterByStatus,
  filterConversations,
  formatListTime,
  getInitials,
  groupMessagesByDay,
  maskPhone,
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
    phone: '+54 9 11 5555 0000',
    channel: 'App',
    handledBy: 'ai_agent',
    closed: false,
    topic: 'Consulta',
    tags: [],
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
      { id: '3', from: 'assistant' as const, text: 'c', sentAt: localIso(28) },
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
      { id: '2', from: 'assistant' as const, text: 'b', sentAt: localIso(28, 9) },
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

describe('maskPhone', () => {
  it('keeps country and area codes and the last four digits', () => {
    expect(maskPhone('+54 9 11 5555 4821')).toBe('+54 9 11 •••• 4821');
    expect(maskPhone('+57 310 555 7712')).toBe('+57 310 •••• 7712');
  });

  it('shows only the last four digits when there are no groups', () => {
    expect(maskPhone('5491155554821')).toBe('•••• 4821');
  });
});

describe('conversation statuses', () => {
  const base = conversationAt('c1', 'Ana', localIso(28));
  const waiting = { ...base, customerId: 'w', handledBy: 'human_queue' as const };
  const advisor = { ...base, customerId: 'a', handledBy: 'human_agent' as const };
  const resolved = { ...base, customerId: 'r', closed: true };

  it('conversationStatus maps handledBy, and closed wins', () => {
    expect(conversationStatus(base)).toBe('assistant');
    expect(conversationStatus(waiting)).toBe('waiting');
    expect(conversationStatus(advisor)).toBe('advisor');
    expect(conversationStatus(resolved)).toBe('resolved');
    expect(conversationStatus({ ...advisor, closed: true })).toBe('resolved');
  });

  it('filterByStatus keeps only the chosen status, or everything for all', () => {
    const all = [base, waiting, advisor, resolved];
    expect(filterByStatus(all, 'waiting').map((c) => c.customerId)).toEqual(['w']);
    expect(filterByStatus(all, 'advisor').map((c) => c.customerId)).toEqual(['a']);
    expect(filterByStatus(all, 'all')).toHaveLength(4);
  });

  it('countByStatus counts each status', () => {
    expect(countByStatus([base, waiting, waiting, resolved])).toEqual({
      assistant: 1,
      waiting: 2,
      advisor: 0,
      resolved: 1,
    });
  });
});

describe('MOCK_CONVERSATIONS handoff data', () => {
  it('has a conversation waiting for an advisor', () => {
    expect(MOCK_CONVERSATIONS.some((c) => c.handledBy === 'human_queue')).toBe(true);
  });

  it('has an image with hidden sensitive data', () => {
    const redacted = MOCK_CONVERSATIONS.flatMap((c) => c.messages).filter(
      (m) => (m.attachment?.redactions.length ?? 0) > 0,
    );
    expect(redacted.length).toBeGreaterThan(0);
  });
});
