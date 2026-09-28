import { describe, expect, it } from 'vitest';

import {
  type AdvisorChat,
  type AdvisorMessage,
  canReply,
  inboxFiltersFor,
  inboxUrl,
  isHeldByOther,
  mergeMessages,
  statusOf,
  toBubble,
} from '@/lib/advisor';

const ME = 'babbage@example.com';

function chat(overrides: Partial<AdvisorChat> = {}): AdvisorChat {
  return {
    id: 'c1',
    title: 'Transferencia',
    createdAt: '2026-09-28T10:00:00.000Z',
    userId: 'u1',
    userEmail: 'curie@example.com',
    handledBy: 'ai_agent',
    assignedTo: null,
    assignedAt: null,
    closedAt: null,
    useCase: 'UC-01',
    ...overrides,
  };
}

function message(id: string, overrides: Partial<AdvisorMessage> = {}): AdvisorMessage {
  return {
    id,
    chatId: 'c1',
    role: 'assistant',
    parts: [{ type: 'text', text: `msg ${id}` }],
    createdAt: '2026-09-28T10:00:00.000Z',
    senderType: 'ai_agent',
    senderId: null,
    ...overrides,
  };
}

describe('statusOf', () => {
  it('is resolved when closed, otherwise follows handledBy', () => {
    expect(statusOf(chat())).toBe('assistant');
    expect(statusOf(chat({ handledBy: 'human_queue' }))).toBe('waiting');
    expect(statusOf(chat({ handledBy: 'human_agent', assignedTo: ME }))).toBe('advisor');
    expect(statusOf(chat({ closedAt: '2026-09-28T11:00:00.000Z' }))).toBe('resolved');
  });
});

describe('canReply and isHeldByOther', () => {
  it('only whoever holds an open chat can write', () => {
    const held = chat({ handledBy: 'human_agent', assignedTo: ME });
    expect(canReply(held, ME)).toBe(true);
    expect(canReply(held, 'ada@example.com')).toBe(false);
    expect(canReply(chat({ handledBy: 'human_queue' }), ME)).toBe(false);
    expect(canReply({ ...held, closedAt: '2026-09-28T11:00:00.000Z' }, ME)).toBe(false);
    expect(canReply(held, undefined)).toBe(false);
  });

  it('compares emails without case', () => {
    const held = chat({ handledBy: 'human_agent', assignedTo: 'Babbage@Example.com' });
    expect(canReply(held, ME)).toBe(true);
    expect(isHeldByOther(held, ME)).toBe(false);
    const advisor = message('m', { senderType: 'human_agent', senderId: 'BABBAGE@example.com' });
    expect(toBubble(advisor, ME).label).toBe('Tú');
  });

  it('flags chats held by someone else', () => {
    const held = chat({ handledBy: 'human_agent', assignedTo: 'ada@example.com' });
    expect(isHeldByOther(held, ME)).toBe(true);
    expect(isHeldByOther(held, 'ada@example.com')).toBe(false);
    expect(isHeldByOther(chat(), ME)).toBe(false);
  });
});

describe('inboxUrl', () => {
  it('maps each filter to the contract params', () => {
    const params = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);
    expect(params(inboxUrl('open'))).toEqual({ limit: '20', status: 'open' });
    expect(params(inboxUrl('waiting'))).toMatchObject({ status: 'open', handledBy: 'human_queue' });
    expect(params(inboxUrl('assistant'))).toMatchObject({ handledBy: 'ai_agent' });
    expect(params(inboxUrl('mine'))).toMatchObject({ assignedTo: 'me' });
    expect(params(inboxUrl('closed'))).toMatchObject({ status: 'closed' });
    expect(params(inboxUrl('open', { startingAfter: 'c9' }))).toMatchObject({ starting_after: 'c9' });
    expect(params(inboxUrl('all'))).toEqual({ limit: '20' });
    expect(params(inboxUrl('all', { userId: 'u7' }))).toEqual({ limit: '20', userId: 'u7' });
  });
});

describe('mergeMessages', () => {
  it('appends new messages in order and skips repeats', () => {
    const merged = mergeMessages([message('a'), message('b')], [message('b'), message('c')]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the same array when nothing is new', () => {
    const current = [message('a')];
    expect(mergeMessages(current, [message('a')])).toBe(current);
  });
});

describe('toBubble', () => {
  it('labels advisor messages as mine or by email, and the agent as David', () => {
    const advisor = message('m', { senderType: 'human_agent', senderId: ME });
    expect(toBubble(advisor, ME)).toMatchObject({ from: 'advisor', label: 'Tú' });
    expect(toBubble(advisor, 'ada@example.com')).toMatchObject({ label: ME });
    expect(toBubble(message('n'), ME)).toMatchObject({ from: 'assistant', label: 'David' });
  });

  it('reads old messages without senderType by role', () => {
    expect(toBubble(message('u', { role: 'user', senderType: null }), ME).from).toBe('customer');
    expect(toBubble(message('s', { role: 'system', senderType: null }), ME).from).toBe('system');
    expect(toBubble(message('x', { senderType: null }), ME).from).toBe('assistant');
  });
});

describe('inboxFiltersFor', () => {
  it('gives the admin "Todas" and the advisor "Mías"', () => {
    const ids = (role: 'advisor' | 'admin') => inboxFiltersFor(role).map((f) => f.id);
    expect(ids('admin')).toContain('all');
    expect(ids('admin')).not.toContain('mine');
    expect(ids('advisor')).toContain('mine');
    expect(ids('advisor')).not.toContain('all');
  });
});
