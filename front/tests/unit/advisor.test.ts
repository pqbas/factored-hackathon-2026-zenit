import { describe, expect, it } from 'vitest';

import {
  type AdvisorChat,
  type AdvisorMessage,
  attentionOf,
  canReply,
  countFor,
  countsUrl,
  parseCounts,
  groupByHandoffReason,
  lastActivityAt,
  rowText,
  sameView,
  useCaseOf,
  viewUrl,
  isHeldByOther,
  isDavidReplying,
  groupByDavidSection,
  holderLabel,
  customerConversationsUrl,
  customerKeyOf,
  customerLabel,
  secondaryEmail,
  type Bubble,
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
    customerName: null,
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
    // One row per customer in every view.
    expect(params(viewUrl({ kind: 'inbox' }))).toEqual({ limit: '20', groupBy: 'customer', status: 'open' });
    expect(params(viewUrl({ kind: 'reason', reason: 'complaint' }))).toEqual({
      limit: '20',
      groupBy: 'customer',
      status: 'open',
      handoffReason: 'complaint',
    });
    expect(params(viewUrl({ kind: 'waiting' }))).toMatchObject({ status: 'open', handledBy: 'human_queue' });
    expect(params(viewUrl({ kind: 'david' }))).toMatchObject({ status: 'open', handledBy: 'ai_agent' });
    expect(params(viewUrl({ kind: 'advisor' }))).toMatchObject({ status: 'open', handledBy: 'human_agent' });
    expect(params(viewUrl({ kind: 'resolved' }))).toMatchObject({ status: 'closed' });
    expect(params(viewUrl({ kind: 'inbox' }, { startingAfter: 'c9', userId: 'u7' }))).toMatchObject({
      starting_after: 'c9',
      userId: 'u7',
    });
  });

  it('compares views, including the reason', () => {
    expect(sameView({ kind: 'inbox' }, { kind: 'inbox' })).toBe(true);
    expect(sameView({ kind: 'reason', reason: 'complaint' }, { kind: 'reason', reason: 'retention' })).toBe(false);
  });
});

function withReason(id: string, reason: string | null): AdvisorChat {
  return chat({
    id,
    handoff: reason
      ? { reason, summary: null, verifiedData: null, facts: null, at: '2026-09-28T10:00:00.000Z', resolvedAt: null }
      : null,
  });
}

describe('groupByHandoffReason', () => {
  it('orders sections by reason, unknown ones next, and "Otros" last', () => {
    const groups = groupByHandoffReason([
      withReason('a', null),
      withReason('b', 'case_status'),
      withReason('c', 'new_one'),
      withReason('d', 'complaint'),
      withReason('e', 'retention'),
      withReason('f', 'complaint'),
    ]);
    expect(groups.map((g) => [g.id, g.chats.map((c) => c.id)])).toEqual([
      ['complaint', ['d', 'f']],
      ['retention', ['e']],
      ['case_status', ['b']],
      ['new_one', ['c']],
      ['NONE', ['a']],
    ]);
    expect(groups.at(-1)?.label).toBe('Otros');
  });

  it('returns only the sections that have chats', () => {
    expect(groupByHandoffReason([withReason('a', 'retention')]).map((g) => g.id)).toEqual(['retention']);
  });
});

describe('useCaseOf', () => {
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
  it('rows say nothing while David handles the chat; the header says Con AI', () => {
    expect(attentionOf(chat(), ME)).toBeNull();
    expect(attentionOf(chat(), ME, { long: true })?.text).toBe('Con AI');
  });

  it('flags waiting, held and resolved chats', () => {
    expect(attentionOf(chat({ handledBy: 'human_queue' }), ME)?.text).toBe('En espera');
    const mine = chat({ handledBy: 'human_agent', assignedTo: ME });
    // Rows say only the state; the advisor has their own column (holderLabel).
    expect(attentionOf(mine, ME)?.text).toBe('Con asesor');
    expect(attentionOf(mine, ME, { long: true })?.text).toBe('Con asesor · la atiendes tú');
    const other = chat({ handledBy: 'human_agent', assignedTo: 'ada@example.com' });
    expect(attentionOf(other, ME)?.text).toBe('Con asesor');
    expect(attentionOf(other, ME, { long: true })?.text).toBe('Con asesor · ada@example.com');
    expect(attentionOf(chat({ closedAt: '2026-09-28T11:00:00.000Z' }), ME)?.text).toBe('Resuelta');
  });
});

describe('rowText and lastActivityAt', () => {
  const last = (text: string) => ({
    text,
    senderType: 'customer' as const,
    createdAt: '2026-09-28T12:00:00.000Z',
  });

  it('shows the customer\'s last message, else the title', () => {
    expect(rowText(chat({ lastMessage: last('Es urgente') }))).toBe('Es urgente');
    expect(rowText(chat({ title: 'Transferencia', lastMessage: null }))).toBe('Transferencia');
    expect(rowText(chat({ title: 'Transferencia', lastMessage: last('  ') }))).toBe('Transferencia');
  });

  it('dates the row by the last message, else the chat start', () => {
    expect(lastActivityAt(chat({ lastMessage: last('x') }))).toBe('2026-09-28T12:00:00.000Z');
    expect(lastActivityAt(chat({ lastMessage: null }))).toBe('2026-09-28T10:00:00.000Z');
  });
});

describe('view counts', () => {
  it('reads the counts and treats missing or bad numbers as 0', () => {
    expect(
      parseCounts({
        total: 7,
        unattended: 2,
        byHandoffReason: { complaint: 3, retention: -1 },
        withAdvisor: 4,
      }),
    ).toEqual({
      inbox: 7,
      david: 0,
      waiting: 2,
      advisor: 4,
      resolved: 0,
      reasons: { complaint: 3, retention: 0 },
    });
    expect(parseCounts(null)).toEqual({
      inbox: 0,
      david: 0,
      waiting: 0,
      advisor: 0,
      resolved: 0,
      reasons: {},
    });
  });

  it('picks the number for each view', () => {
    const counts = parseCounts({
      total: 7,
      unattended: 2,
      withAdvisor: 1,
      resolved: 4,
      aiAgent: 12,
      byHandoffReason: { complaint: 3 },
    });
    expect(countFor({ kind: 'inbox' }, counts)).toBe(7);
    expect(countFor({ kind: 'david' }, counts)).toBe(12);
    expect(countFor({ kind: 'waiting' }, counts)).toBe(2);
    expect(countFor({ kind: 'reason', reason: 'complaint' }, counts)).toBe(3);
    expect(countFor({ kind: 'reason', reason: 'retention' }, counts)).toBe(0);
    expect(countFor({ kind: 'advisor' }, counts)).toBe(1);
    expect(countFor({ kind: 'advisor' }, undefined)).toBe(0);
  });

  it('asks for the counts of one user when filtered', () => {
    expect(countsUrl()).toBe('/api/advisor/conversations/counts?groupBy=customer');
    expect(countsUrl('u7')).toBe('/api/advisor/conversations/counts?groupBy=customer&userId=u7');
  });
});

describe('isDavidReplying', () => {
  const now = new Date('2026-09-28T10:00:30.000Z');
  const bubble = (from: Bubble['from'], sentAt = '2026-09-28T10:00:10.000Z'): Bubble => ({
    id: `${from}-${sentAt}`,
    from,
    label: null,
    text: 'hola',
    sentAt,
  });

  it('is true while David has an unanswered customer message', () => {
    expect(isDavidReplying(chat(), [bubble('assistant'), bubble('customer')], now)).toBe(true);
  });

  it('ignores system notices after the customer message', () => {
    expect(isDavidReplying(chat(), [bubble('customer'), bubble('system')], now)).toBe(true);
  });

  it('is false once David answered, or when a person handles the chat', () => {
    expect(isDavidReplying(chat(), [bubble('customer'), bubble('assistant')], now)).toBe(false);
    expect(isDavidReplying(chat({ handledBy: 'human_queue' }), [bubble('customer')], now)).toBe(
      false,
    );
    expect(isDavidReplying(chat({ closedAt: '2026-09-28T10:00:20.000Z' }), [bubble('customer')], now)).toBe(false);
  });

  it('gives up after a minute without a reply', () => {
    expect(isDavidReplying(chat(), [bubble('customer', '2026-09-28T09:58:00.000Z')], now)).toBe(
      false,
    );
  });
});

describe('customerLabel and secondaryEmail', () => {
  it('names the bank customer and keeps the email as secondary', () => {
    const named = chat({ customerName: 'Javier Molina Morales' });
    expect(customerLabel(named)).toBe('Javier Molina Morales');
    expect(secondaryEmail(named)).toBe('curie@example.com');
  });

  it('falls back to the email when there is no customer name', () => {
    for (const customerName of [undefined, null, '  ']) {
      const c = chat({ customerName });
      expect(customerLabel(c)).toBe('curie@example.com');
      expect(secondaryEmail(c)).toBeNull();
    }
    expect(customerLabel(chat({ userEmail: null }))).toBe('Cliente sin email');
  });
});

describe('customers', () => {
  it('keys a row by its customer, else by the chat', () => {
    expect(customerKeyOf({ ...chat(), customerKey: 'CUS1' })).toBe('CUS1');
    expect(customerKeyOf(chat({ id: 'c9' }))).toBe('c9');
  });

  it('encodes the customer key in the path', () => {
    expect(customerConversationsUrl('ana@banco.test')).toBe(
      '/api/advisor/customers/ana%40banco.test/conversations',
    );
  });

  it('orders rows by the latest message time when the back sends it', () => {
    expect(lastActivityAt({ ...chat(), updatedAt: '2026-09-28T12:00:00.000Z' })).toBe(
      '2026-09-28T12:00:00.000Z',
    );
  });
});

describe('toBubble text parts', () => {
  it('keeps separate text parts as separate paragraphs', () => {
    const message = {
      id: 'm1',
      chatId: 'c1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Se verificó que la transacción fue aprobada.' },
        { type: 'text', text: 'Te comunico con un asesor.' },
      ],
      createdAt: '2026-09-29T00:15:00.000Z',
      senderType: 'ai_agent',
      senderId: null,
    } as unknown as AdvisorMessage;
    expect(toBubble(message, ME).text).toBe(
      'Se verificó que la transacción fue aprobada.\n\nTe comunico con un asesor.',
    );
  });
});

describe('holderLabel', () => {
  it('names the advisor who took the chat, "tú" for the viewer, nothing otherwise', () => {
    expect(holderLabel(chat({ handledBy: 'human_agent', assignedTo: ME }), ME)).toBe('tú');
    expect(holderLabel(chat({ handledBy: 'human_agent', assignedTo: 'asesor1@banco.test' }), ME)).toBe('asesor1');
    expect(holderLabel(chat({ handledBy: 'human_queue' }), ME)).toBeNull();
    expect(holderLabel(chat(), ME)).toBeNull();
    expect(
      holderLabel(chat({ handledBy: 'human_agent', assignedTo: ME, closedAt: '2026-09-29T10:00:00.000Z' }), ME),
    ).toBeNull();
  });
});

describe('groupByDavidSection', () => {
  it('sections Agente AI by what David is working on, Otros last', () => {
    const groups = groupByDavidSection([
      chat({ id: 'a', useCase: 'GREETING' }),
      chat({ id: 'b', useCase: 'CANCEL' }),
      chat({ id: 'c', useCase: 'GENERAL_INQUIRY' }),
      chat({ id: 'd', useCase: 'COMPLAINT' }),
      chat({ id: 'e', useCase: 'RETENTION' }),
      chat({ id: 'f', useCase: null }),
      chat({ id: 'g', useCase: 'CASE_STATUS' }),
    ]);
    expect(groups.map((g) => [g.id, g.label, g.chats.map((c) => c.id)])).toEqual([
      ['complaint', 'Reclamo', ['d']],
      ['retention', 'Cancelación de producto', ['b', 'e']],
      ['case_status', 'Estado de un reclamo', ['g']],
      ['general', 'Consultas generales', ['c']],
      ['NONE', 'Otros', ['a', 'f']],
    ]);
  });
});
