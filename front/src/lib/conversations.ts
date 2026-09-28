// Pure helpers for the /conversations mock view: no side effects, no fetch.

import { format, isSameDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import type { MockConversation, MockMessage } from '@/mocks/conversations';

// "Santiago · México" -> "SM"; "Cliente cerrado" -> "CC"; "Ana" -> "AN".
export function getInitials(name: string): string {
  const words = name.split(/\s+/).filter((word) => /[a-zA-Z]/.test(word));
  if (words.length === 0) return '';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const first = words[0][0];
  const last = words[words.length - 1][0];
  return `${first}${last}`.toUpperCase();
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function filterConversations(
  conversations: MockConversation[],
  query: string,
): MockConversation[] {
  const needle = normalize(query.trim());
  if (!needle) return conversations;
  return conversations.filter((conversation) =>
    normalize(conversation.name).includes(needle),
  );
}

function lastMessageTime(conversation: MockConversation): number {
  const last = conversation.messages[conversation.messages.length - 1];
  return last ? new Date(last.sentAt).getTime() : 0;
}

export function sortByLastMessage(
  conversations: MockConversation[],
): MockConversation[] {
  return [...conversations].sort(
    (a, b) => lastMessageTime(b) - lastMessageTime(a),
  );
}

export type MessageDayGroup = {
  label: string;
  messages: MockMessage[];
};

export function groupMessagesByDay(
  messages: MockMessage[],
  now: Date,
): MessageDayGroup[] {
  const yesterday = subDays(now, 1);
  const groups: MessageDayGroup[] = [];

  for (const message of messages) {
    const date = new Date(message.sentAt);
    const label = isSameDay(date, now)
      ? 'Hoy'
      : isSameDay(date, yesterday)
        ? 'Ayer'
        : format(date, "d 'de' MMMM", { locale: es });

    const currentGroup = groups[groups.length - 1];
    if (currentGroup && currentGroup.label === label) {
      currentGroup.messages.push(message);
    } else {
      groups.push({ label, messages: [message] });
    }
  }

  return groups;
}

export function formatListTime(iso: string, now: Date): string {
  const date = new Date(iso);
  if (isSameDay(date, now)) return format(date, 'HH:mm');
  if (isSameDay(date, subDays(now, 1))) return 'Ayer';
  return format(date, 'dd/MM/yyyy');
}
