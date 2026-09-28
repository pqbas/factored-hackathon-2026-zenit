import { expect, test } from '@playwright/test';
import type { ChatMessage } from '@chat-template/core';
import {
  generateTitleFromUserMessage,
  titleFromText,
} from '../../server/src/title';

function userMessage(text: string): ChatMessage {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    role: 'user',
    parts: [{ type: 'text', text }],
  };
}

test.describe('titleFromText', () => {
  test('keeps a short message as is, collapsing whitespace', () => {
    expect(titleFromText('  ¿Cuál es   mi saldo?\n')).toBe(
      '¿Cuál es mi saldo?',
    );
  });

  test('truncates a long message to 60 characters with an ellipsis', () => {
    const title = titleFromText('a'.repeat(100));
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
  });
});

test.describe('generateTitleFromUserMessage with API_PROXY', () => {
  const originalApiProxy = process.env.API_PROXY;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  test.beforeEach(() => {
    process.env.API_PROXY = 'http://localhost:8000/invocations';
    fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      return new Response(
        JSON.stringify({
          output_text: 'Para ayudarte necesito que inicies sesión',
        }),
      );
    }) as typeof fetch;
  });

  test.afterEach(() => {
    if (originalApiProxy === undefined) {
      Reflect.deleteProperty(process.env, 'API_PROXY');
    } else {
      process.env.API_PROXY = originalApiProxy;
    }
    globalThis.fetch = originalFetch;
  });

  test("uses the user's words and never calls the agent", async () => {
    const title = await generateTitleFromUserMessage({
      message: userMessage('¿Cuál es el saldo de mi tarjeta de crédito?'),
    });

    expect(title).toBe('¿Cuál es el saldo de mi tarjeta de crédito?');
    expect(fetchCalls).toBe(0);
  });

  test('falls back to a fixed title when the message has no text', async () => {
    const title = await generateTitleFromUserMessage({
      message: userMessage('   '),
    });

    expect(title).toBe('Nueva conversación');
    expect(fetchCalls).toBe(0);
  });
});
