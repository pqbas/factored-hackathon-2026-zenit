import { describe, expect, it } from 'vitest';

import {
  type AdvisorChat,
  type AdvisorMessage,
  attentionOf,
  canReply,
  groupByUseCase,
  lastActivityAt,
  lastMessagePreview,
  sameView,
  useCaseOf,
  viewUrl,
  isHeldByOther,
  mergeMessages,
  statusOf,
  toBubble,
  useCaseTag,
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

describe('viewUrl', () => {
  it('maps each view to the contract params', () => {
    const params = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);
    expect(params(viewUrl({ kind: 'inbox' }))).toEqual({ limit: '20', status: 'open' });
    expect(params(viewUrl({ kind: 'useCase', useCase: 'COMPLAINT' }))).toEqual({
      limit: '20',
      status: 'open',
      useCase: 'COMPLAINT',
    });
    expect(params(viewUrl({ kind: 'waiting' }))).toMatchObject({ status: 'open', handledBy: 'human_queue' });
    expect(params(viewUrl({ kind: 'mine' }))).toMatchObject({ assignedTo: 'me' });
    expect(params(viewUrl({ kind: 'resolved' }))).toMatchObject({ status: 'closed' });
    expect(params(viewUrl({ kind: 'inbox' }, { startingAfter: 'c9', userId: 'u7' }))).toMatchObject({
      starting_after: 'c9',
      userId: 'u7',
    });
  });

  it('compares views, including the use case', () => {
    expect(sameView({ kind: 'inbox' }, { kind: 'inbox' })).toBe(true);
    expect(sameView({ kind: 'useCase', useCase: 'A' }, { kind: 'useCase', useCase: 'B' })).toBe(false);
  });
});

describe('groupByUseCase', () => {
  it('orders sections by use case, unknown ones next, and "Otras" last', () => {
    const groups = groupByUseCase([
      chat({ id: 'a', useCase: null }),
      chat({ id: 'b', useCase: 'GENERAL_INQUIRY' }),
      chat({ id: 'c', useCase: 'NEW_ONE' }),
      chat({ id: 'd', useCase: 'COMPLAINT' }),
      chat({ id: 'e', useCase: 'GREETING' }),
      chat({ id: 'f', useCase: 'COMPLAINT' }),
    ]);
    expect(groups.map((g) => [g.id, g.chats.map((c) => c.id)])).toEqual([
      ['COMPLAINT', ['d', 'f']],
      ['GENERAL_INQUIRY', ['b']],
      ['NEW_ONE', ['c']],
      ['OTHER', ['a', 'e']],
    ]);
    expect(groups.at(-1)?.label).toBe('Otras');
  });

  it('files small talk and chats without a use case under OTHER', () => {
    expect(useCaseOf(chat({ useCase: 'GOODBYE' }))).toBe('OTHER');
    expect(useCaseOf(chat({ useCase: null }))).toBe('OTHER');
    expect(useCaseOf(chat({ useCase: 'CANCEL' }))).toBe('CANCEL');
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


describe('useCaseTag', () => {
  it('labels the use case, and shows nothing without one or for small talk', () => {
    expect(useCaseTag(chat({ useCase: 'GENERAL_INQUIRY' }))).toBe('Consultas generales');
    expect(useCaseTag(chat({ useCase: 'COMPLAINT' }))).toBe('Reclamo');
    expect(useCaseTag(chat({ useCase: null }))).toBeNull();
    expect(useCaseTag(chat({ useCase: 'GREETING' }))).toBeNull();
    expect(useCaseTag(chat({ useCase: 'NEW_ONE' }))).toBe('NEW_ONE');
  });
});

describe('attentionOf', () => {
  it('says nothing while David handles the chat', () => {
    expect(attentionOf(chat(), ME)).toBeNull();
  });

  it('flags waiting, held and resolved chats', () => {
    expect(attentionOf(chat({ handledBy: 'human_queue' }), ME)?.text).toBe('Sin atender');
    const mine = chat({ handledBy: 'human_agent', assignedTo: ME });
    expect(attentionOf(mine, ME)?.text).toBe('Tú');
    expect(attentionOf(mine, ME, { long: true })?.text).toBe('La atiendes tú');
    const other = chat({ handledBy: 'human_agent', assignedTo: 'ada@example.com' });
    expect(attentionOf(other, ME)?.text).toBe('La atiende ada');
    expect(attentionOf(other, ME, { long: true })?.text).toBe('La atiende ada@example.com');
    expect(attentionOf(chat({ closedAt: '2026-09-28T11:00:00.000Z' }), ME)?.text).toBe('Resuelta');
  });
});

describe('lastMessagePreview and lastActivityAt', () => {
  const last = (text: string) => ({
    text,
    senderType: 'customer' as const,
    createdAt: '2026-09-28T12:00:00.000Z',
  });

  it('shows the customer\'s last message unless it repeats the subject', () => {
    expect(lastMessagePreview(chat({ lastMessage: last('Es urgente') }))).toBe('Es urgente');
    expect(lastMessagePreview(chat({ title: 'Hola', lastMessage: last('Hola') }))).toBeNull();
    expect(lastMessagePreview(chat({ lastMessage: null }))).toBeNull();
  });

  it('dates the row by the last message, else the chat start', () => {
    expect(lastActivityAt(chat({ lastMessage: last('x') }))).toBe('2026-09-28T12:00:00.000Z');
    expect(lastActivityAt(chat({ lastMessage: null }))).toBe('2026-09-28T10:00:00.000Z');
  });
});
