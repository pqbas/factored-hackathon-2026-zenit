import type { DBMessage } from '@chat-template/db';

const PREVIEW_LENGTH = 140;

export interface LastMessagePreview {
  text: string;
  senderType: DBMessage['senderType'];
  createdAt: Date;
}

// Plain text of a message's text parts, collapsed and cut for the inbox row.
export function toLastMessagePreview(message: DBMessage): LastMessagePreview {
  const parts = Array.isArray(message.parts)
    ? (message.parts as Array<{ type?: string; text?: string }>)
    : [];
  const text = parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    text:
      text.length > PREVIEW_LENGTH
        ? `${text.slice(0, PREVIEW_LENGTH - 1).trimEnd()}…`
        : text,
    senderType: message.senderType,
    createdAt: message.createdAt,
  };
}
