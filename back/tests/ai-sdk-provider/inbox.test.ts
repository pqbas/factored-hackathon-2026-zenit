import { expect, test } from '@playwright/test';
import type { DBMessage } from '@chat-template/db';
import { toLastMessagePreview } from '../../server/src/inbox';

function dbMessage(parts: unknown): DBMessage {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    chatId: '00000000-0000-4000-8000-000000000001',
    role: 'assistant',
    parts,
    attachments: [],
    createdAt: new Date('2026-09-28T12:00:00Z'),
    blocked: false,
    senderType: 'ai_agent',
    senderId: null,
  } as DBMessage;
}

test.describe('toLastMessagePreview', () => {
  test('joins only the text parts, collapsing whitespace', () => {
    const preview = toLastMessagePreview(
      dbMessage([
        { type: 'text', text: 'Tu saldo  es' },
        { type: 'tool-call', toolName: 'balance' },
        { type: 'text', text: '\n$1.200' },
      ]),
    );
    expect(preview.text).toBe('Tu saldo es $1.200');
    expect(preview.senderType).toBe('ai_agent');
  });

  test('cuts long text to 140 characters with an ellipsis', () => {
    const preview = toLastMessagePreview(
      dbMessage([{ type: 'text', text: 'x'.repeat(300) }]),
    );
    expect(preview.text).toHaveLength(140);
    expect(preview.text.endsWith('…')).toBe(true);
  });

  test('returns empty text when there are no text parts', () => {
    expect(toLastMessagePreview(dbMessage([])).text).toBe('');
  });
});
