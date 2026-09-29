import { expect, test } from '@playwright/test';
import type { ChatMessage } from '@chat-template/core';
import {
  buildAgentHistory,
  isPaused,
  shouldPersistAgentReply,
  trimAfterHandoff,
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

test.describe('isPaused', () => {
  test('is false only for the agent with no open handoff', () => {
    expect(isPaused({ handledBy: 'ai_agent', hasOpenHandoff: false })).toBe(
      false,
    );
  });

  test('is true with an open handoff even if the agent still owns the chat', () => {
    expect(isPaused({ handledBy: 'ai_agent', hasOpenHandoff: true })).toBe(
      true,
    );
  });

  test('is true when a human owns the chat, with or without a handoff', () => {
    for (const handledBy of ['human_queue', 'human_agent'] as const) {
      expect(isPaused({ handledBy, hasOpenHandoff: false })).toBe(true);
      expect(isPaused({ handledBy, hasOpenHandoff: true })).toBe(true);
    }
  });
});

test.describe('trimAfterHandoff', () => {
  const es = 'Te comunico con un asesor, que ya tiene los datos de tu caso.';
  const pt =
    'Vou transferir você para um atendente, que já tem os dados do seu caso.';

  test('drops the parts after the handoff message', () => {
    const parts = [
      { type: 'text', text: es },
      { type: 'text', text: 'Mientras tanto, ¿algo más?' },
    ];
    expect(trimAfterHandoff(parts)).toEqual([{ type: 'text', text: es }]);
  });

  test('cuts text glued after the phrase in the same part', () => {
    const parts = [{ type: 'text', text: `${es} ¿Algo más en lo que ayude?` }];
    expect(trimAfterHandoff(parts)).toEqual([{ type: 'text', text: es }]);
  });

  test('keeps what comes before the handoff message', () => {
    const parts = [
      { type: 'text', text: 'Entiendo tu reclamo.' },
      { type: 'text', text: es },
      { type: 'text', text: 'extra' },
    ];
    expect(trimAfterHandoff(parts)).toEqual(parts.slice(0, 2));
  });

  test('works in Portuguese', () => {
    const parts = [{ type: 'text', text: `${pt} Posso ajudar em mais algo?` }];
    expect(trimAfterHandoff(parts)).toEqual([{ type: 'text', text: pt }]);
  });

  test('leaves the parts untouched when there is no handoff phrase', () => {
    const parts = [
      { type: 'text', text: 'Tu saldo es USD 100.' },
      { type: 'text', text: 'Algo más?' },
    ];
    expect(trimAfterHandoff(parts)).toBe(parts);
  });
});
