import { expect, test } from '@playwright/test';
import type { ChatMessage } from '@chat-template/core';
import {
  buildAgentHistory,
  shouldPersistAgentReply,
} from '../../server/src/agent-turn';

function textMessage(
  overrides: Partial<ChatMessage> & { text: string },
): ChatMessage {
  const { text, ...rest } = overrides;
  return {
    id: 'id',
    role: 'user',
    parts: [{ type: 'text', text }],
    metadata: { createdAt: new Date().toISOString() },
    ...rest,
  } as ChatMessage;
}

test.describe('buildAgentHistory', () => {
  test('excludes system messages', () => {
    const history = buildAgentHistory([
      textMessage({ role: 'system', text: 'Te atiende un asesor.' }),
      textMessage({ role: 'user', text: 'hola' }),
    ]);

    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('user');
  });

  test('excludes blocked messages', () => {
    const history = buildAgentHistory([
      textMessage({
        role: 'user',
        text: 'mensaje rechazado',
        metadata: { createdAt: new Date().toISOString(), blocked: true },
      }),
      textMessage({ role: 'user', text: 'otra pregunta' }),
    ]);

    expect(history).toHaveLength(1);
    expect(history[0].parts[0]).toMatchObject({ text: 'otra pregunta' });
  });

  test('prefixes only human_agent replies with [Asesor] ', () => {
    const history = buildAgentHistory([
      textMessage({
        role: 'assistant',
        text: 'te ayudo con eso',
        metadata: {
          createdAt: new Date().toISOString(),
          senderType: 'human_agent',
        },
      }),
      textMessage({
        role: 'assistant',
        text: 'respuesta del agente',
        metadata: {
          createdAt: new Date().toISOString(),
          senderType: 'ai_agent',
        },
      }),
      textMessage({ role: 'user', text: 'sin senderType' }),
    ]);

    expect(history[0].parts[0]).toMatchObject({
      text: '[Asesor] te ayudo con eso',
    });
    expect(history[1].parts[0]).toMatchObject({ text: 'respuesta del agente' });
    expect(history[2].parts[0]).toMatchObject({ text: 'sin senderType' });
  });

  test('never mutates the original messages', () => {
    const original = textMessage({
      role: 'assistant',
      text: 'hola',
      metadata: {
        createdAt: new Date().toISOString(),
        senderType: 'human_agent',
      },
    });

    buildAgentHistory([original]);

    expect(original.parts[0]).toMatchObject({ text: 'hola' });
  });
});

test.describe('shouldPersistAgentReply', () => {
  test('persists when the chat is still handled by the agent', () => {
    expect(shouldPersistAgentReply('ai_agent')).toBe(true);
  });

  test('discards when an advisor took the chat mid-stream', () => {
    expect(shouldPersistAgentReply('human_agent')).toBe(false);
  });

  test('discards when the chat moved to the human queue', () => {
    expect(shouldPersistAgentReply('human_queue')).toBe(false);
  });
});
