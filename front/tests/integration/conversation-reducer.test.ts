import { describe, expect, it } from 'vitest';

import {
  conversationReducer,
  conversationStatus,
  countByStatus,
} from '@/lib/conversations';
import { MOCK_CONVERSATIONS } from '@/mocks/conversations';

const SENT_AT = new Date(2026, 8, 28, 12, 0).toISOString();

function fresh() {
  return structuredClone(MOCK_CONVERSATIONS);
}

function find(conversations: typeof MOCK_CONVERSATIONS, customerId: string) {
  const found = conversations.find((c) => c.customerId === customerId);
  if (!found) throw new Error(`missing ${customerId}`);
  return found;
}

// demo-ar-1 starts waiting for an advisor; demo-co-1 is with the assistant.
describe('conversationReducer over the mock conversations', () => {
  it('takes, answers and resolves a waiting conversation', () => {
    let state = fresh();
    const waitingBefore = countByStatus(state).waiting;

    state = conversationReducer(state, {
      type: 'send',
      customerId: 'demo-ar-1',
      text: 'Hola Daniela, ya reviso tu comprobante.',
      sentAt: SENT_AT,
    });
    const taken = find(state, 'demo-ar-1');
    expect(conversationStatus(taken)).toBe('advisor');
    expect(taken.messages.at(-1)?.from).toBe('advisor');
    expect(countByStatus(state).waiting).toBe(waitingBefore - 1);

    state = conversationReducer(state, {
      type: 'resolve',
      customerId: 'demo-ar-1',
      sentAt: SENT_AT,
    });
    const resolved = find(state, 'demo-ar-1');
    expect(conversationStatus(resolved)).toBe('resolved');
    expect(resolved.handledBy).toBe('ai_agent');
    expect(resolved.messages.at(-1)?.from).toBe('system');
  });

  it('ignores advisor messages while the assistant is on', () => {
    const state = fresh();
    const before = find(state, 'demo-co-1').messages.length;
    const next = conversationReducer(state, {
      type: 'send',
      customerId: 'demo-co-1',
      text: 'hola',
      sentAt: SENT_AT,
    });
    expect(find(next, 'demo-co-1').messages).toHaveLength(before);
  });

  it('turning the assistant off lets the advisor write', () => {
    let state = conversationReducer(fresh(), {
      type: 'toggleAssistant',
      customerId: 'demo-co-1',
    });
    expect(conversationStatus(find(state, 'demo-co-1'))).toBe('advisor');

    state = conversationReducer(state, {
      type: 'send',
      customerId: 'demo-co-1',
      text: 'Te escribe un asesor.',
      sentAt: SENT_AT,
    });
    expect(find(state, 'demo-co-1').messages.at(-1)?.text).toBe(
      'Te escribe un asesor.',
    );

    state = conversationReducer(state, {
      type: 'toggleAssistant',
      customerId: 'demo-co-1',
    });
    expect(conversationStatus(find(state, 'demo-co-1'))).toBe('assistant');
  });

  it('adds tags once and skips empty ones or the topic', () => {
    let state = fresh();
    for (const tag of ['Urgente', ' urgente ', '', 'transferencia']) {
      state = conversationReducer(state, {
        type: 'addTag',
        customerId: 'demo-ar-1',
        tag,
      });
    }
    expect(find(state, 'demo-ar-1').tags).toEqual(['Urgente']);
  });

  it('opening a conversation clears its unread count only', () => {
    const state = conversationReducer(fresh(), {
      type: 'select',
      customerId: 'demo-mx-1',
    });
    expect(find(state, 'demo-mx-1').unread).toBe(0);
    expect(find(state, 'demo-ar-1').unread).toBeGreaterThan(0);
  });
});
