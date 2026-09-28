import type { ChatMessage } from '@chat-template/core';
import { describe, expect, it } from 'vitest';

import {
  handledByOf,
  handoffNotice,
  isStateOnlyMessage,
  mergeNewMessages,
  senderOf,
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
  });
});
