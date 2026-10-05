import type { ChatMessage } from '@chat-template/core';
import { describe, expect, it } from 'vitest';

import {
  endsAgentPending,
  handledByOf,
  handoffNotice,
  isStateOnlyMessage,
  mergeNewMessages,
  senderOf,
  isAwaitingDavid,
} from '@/lib/handoff';

function msg(
  id: string,
  role: ChatMessage['role'],
  parts: ChatMessage['parts'] = [{ type: 'text', text: id }],
  senderType?: string,
): ChatMessage {
  return {
    id,
    role,
    parts,
    metadata: { createdAt: '2026-09-28T10:00:00Z', ...(senderType ? { senderType } : {}) },
  } as ChatMessage;
}

describe('handledByOf', () => {
  it('keeps the human states and falls back to ai_agent', () => {
    expect(handledByOf('human_queue')).toBe('human_queue');
    expect(handledByOf('human_agent')).toBe('human_agent');
    expect(handledByOf(undefined)).toBe('ai_agent');
    expect(handledByOf('other')).toBe('ai_agent');
  });
});

describe('isStateOnlyMessage', () => {
  it('spots the assistant message left by a state-only answer', () => {
    const stateOnly = msg('a', 'assistant', [
      { type: 'step-start' },
      { type: 'data-conversation-state', data: { handledBy: 'human_queue' } },
    ] as ChatMessage['parts']);
    expect(isStateOnlyMessage(stateOnly)).toBe(true);
    expect(isStateOnlyMessage(msg('b', 'assistant'))).toBe(false);
    expect(isStateOnlyMessage(msg('c', 'user', []))).toBe(false);
    expect(isStateOnlyMessage(undefined)).toBe(false);
  });
});

describe('mergeNewMessages', () => {
  it('appends only unseen messages in order', () => {
    const merged = mergeNewMessages([msg('a', 'user'), msg('b', 'assistant')], [msg('b', 'assistant'), msg('c', 'assistant')]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('senderOf', () => {
  it('uses senderType and falls back to role', () => {
    expect(senderOf(msg('a', 'assistant', undefined, 'human_agent'))).toBe('advisor');
    expect(senderOf(msg('b', 'system', undefined, 'system'))).toBe('system');
    expect(senderOf(msg('c', 'system'))).toBe('system');
    expect(senderOf(msg('d', 'user'))).toBe('customer');
    expect(senderOf(msg('e', 'assistant'))).toBe('agent');
    expect(senderOf(msg('f', 'assistant', undefined, 'ai_agent'))).toBe('agent');
  });
});

describe('handoffNotice', () => {
  it('says who handles the chat, and nothing for the agent', () => {
    expect(handoffNotice('human_queue')).toContain('Te pasamos con un asesor');
    expect(handoffNotice('human_agent')).toBe('Te atiende un asesor.');
    expect(handoffNotice('ai_agent')).toBeNull();
    expect(handoffNotice('human_queue', 'pt')).toContain('atendente');
  });
});

describe('agent pending', () => {
  it('drops the empty message a queued turn leaves behind', () => {
    const pending = msg('p', 'assistant', [
      { type: 'step-start' },
      { type: 'data-agent-pending', data: { messageId: 'm1' } },
    ] as unknown as ChatMessage['parts']);
    expect(isStateOnlyMessage(pending)).toBe(true);
  });

  it('ends once David or a notice answers, not with the customer', () => {
    expect(endsAgentPending([msg('u', 'user', undefined, 'customer')])).toBe(false);
    expect(endsAgentPending([msg('a', 'assistant', undefined, 'ai_agent')])).toBe(true);
    expect(endsAgentPending([msg('s', 'system', undefined, 'system')])).toBe(true);
    expect(endsAgentPending([])).toBe(false);
  });
});

describe('isAwaitingDavid', () => {
  const customer = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hola' }] } as never;
  const emptyDavid = { id: 'a1', role: 'assistant', parts: [] } as never;
  const david = { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Tu saldo es $1.000.' }] } as never;
  const base = { handledBy: 'ai_agent' as const, agentPending: false };

  it('shows at the end of the list until David has a message', () => {
    expect(isAwaitingDavid({ ...base, status: 'submitted', messages: [customer] })).toBe('list');
    expect(isAwaitingDavid({ ...base, status: 'streaming', messages: [customer] })).toBe('list');
  });

  it("shows inside David's message while it has no text, also when still submitted", () => {
    // The stream's `start` creates the message and the chat stays `submitted`.
    expect(isAwaitingDavid({ ...base, status: 'submitted', messages: [customer, emptyDavid] })).toBe('message');
    expect(isAwaitingDavid({ ...base, status: 'streaming', messages: [customer, emptyDavid] })).toBe('message');
  });

  it('shows for a queued turn, which David answers on his own', () => {
    expect(isAwaitingDavid({ ...base, agentPending: true, status: 'ready', messages: [customer] })).toBe('list');
  });

  it('is gone once the text arrived, when idle, and with an advisor', () => {
    expect(isAwaitingDavid({ ...base, status: 'streaming', messages: [customer, david] })).toBeNull();
    expect(isAwaitingDavid({ ...base, status: 'ready', messages: [customer] })).toBeNull();
    expect(isAwaitingDavid({ ...base, status: 'ready', messages: [customer, david] })).toBeNull();
    expect(isAwaitingDavid({ ...base, status: 'ready', messages: [] })).toBeNull();
    for (const handledBy of ['human_queue', 'human_agent'] as const) {
      expect(
        isAwaitingDavid({ handledBy, agentPending: true, status: 'submitted', messages: [customer, emptyDavid] }),
      ).toBeNull();
    }
  });
});
