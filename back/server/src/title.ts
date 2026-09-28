import { generateText } from 'ai';
import { type ChatMessage, myProvider } from '@chat-template/core';

const MAX_TITLE_LENGTH = 60;

export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_TITLE_LENGTH) return clean;
  return `${clean.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: ChatMessage;
}): Promise<string> {
  // With API_PROXY every model id goes to the agent, which would answer the
  // title prompt as a customer turn (without a session token) and cost a full
  // agent run per new chat. Use the user's own words instead.
  if (process.env.API_PROXY) {
    const text = message.parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join(' ');
    return titleFromText(text) || 'Nueva conversación';
  }

  const model = await myProvider.languageModel('title-model');
  const { text: title } = await generateText({
    model,
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons. do not include other expository content ("I'll help...")`,
    prompt: JSON.stringify(message),
  });

  return title;
}
