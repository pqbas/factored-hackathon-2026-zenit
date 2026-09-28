// Pure helpers for the /conversations mock view: no side effects, no fetch.

import { format, isSameDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  MockAttachment,
  MockConversation,
  MockMessage,
} from '@/mocks/conversations';

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

// "+54 9 11 5555 4821" -> "+54 9 11 •••• 4821": country and area codes stay,
// every group between them and the last four digits is hidden.
export function maskPhone(phone: string): string {
  const groups = phone.trim().split(/\s+/);
  if (groups.length < 3) return `•••• ${phone.replace(/\D/g, '').slice(-4)}`;
  const last = groups[groups.length - 1];
  const head = groups.slice(0, groups.length - 2);
  return [...head, '••••', last].join(' ');
}

export type ConversationStatus = 'assistant' | 'waiting' | 'advisor' | 'resolved';

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  assistant: 'Con asistente',
  waiting: 'Sin atender',
  advisor: 'En atención',
  resolved: 'Resuelto',
};

// Maps the handoff model onto the console's four states.
export function conversationStatus(
  conversation: MockConversation,
): ConversationStatus {
  if (conversation.closed) return 'resolved';
  switch (conversation.handledBy) {
    case 'human_queue':
      return 'waiting';
    case 'human_agent':
      return 'advisor';
    default:
      return 'assistant';
  }
}

export type StatusFilter = 'all' | 'waiting' | 'advisor';

export function filterByStatus(
  conversations: MockConversation[],
  filter: StatusFilter,
): MockConversation[] {
  if (filter === 'all') return conversations;
  return conversations.filter((c) => conversationStatus(c) === filter);
}

export function countByStatus(
  conversations: MockConversation[],
): Record<ConversationStatus, number> {
  const counts = { assistant: 0, waiting: 0, advisor: 0, resolved: 0 };
  for (const conversation of conversations) {
    counts[conversationStatus(conversation)] += 1;
  }
  return counts;
}

export type ConversationAction =
  | { type: 'select'; customerId: string }
  | { type: 'toggleAssistant'; customerId: string }
  | { type: 'send'; customerId: string; text: string; sentAt: string }
  | {
      type: 'attach';
      customerId: string;
      attachment: MockAttachment;
      sentAt: string;
    }
  | { type: 'resolve'; customerId: string; sentAt: string }
  | { type: 'addTag'; customerId: string; tag: string };

function newMessage(
  from: MockMessage['from'],
  text: string,
  sentAt: string,
  attachment?: MockAttachment,
): MockMessage {
  return { id: `mock-msg-${crypto.randomUUID()}`, from, text, sentAt, attachment };
}

// The advisor writes only when the assistant is off. Writing in a waiting
// conversation takes it, like `POST /handoffs/{id}/claim`.
function advisorWrites(
  conversation: MockConversation,
  message: MockMessage,
): MockConversation {
  if (conversation.handledBy === 'ai_agent') return conversation;
  return {
    ...conversation,
    handledBy: 'human_agent',
    closed: false,
    messages: [...conversation.messages, message],
  };
}

function updateConversation(
  conversation: MockConversation,
  action: ConversationAction,
): MockConversation {
  switch (action.type) {
    case 'select':
      return { ...conversation, unread: 0 };
    case 'toggleAssistant':
      return conversation.handledBy === 'ai_agent'
        ? { ...conversation, handledBy: 'human_agent', closed: false }
        : { ...conversation, handledBy: 'ai_agent' };
    case 'send': {
      const text = action.text.trim();
      if (!text) return conversation;
      return advisorWrites(
        conversation,
        newMessage('advisor', text, action.sentAt),
      );
    }
    case 'attach':
      return advisorWrites(
        conversation,
        newMessage('advisor', '', action.sentAt, action.attachment),
      );
    case 'resolve':
      if (conversation.closed) return conversation;
      return {
        ...conversation,
        closed: true,
        handledBy: 'ai_agent',
        messages: [
          ...conversation.messages,
          newMessage(
            'system',
            'Conversación resuelta · vuelve al asistente',
            action.sentAt,
          ),
        ],
      };
    case 'addTag': {
      const tag = action.tag.trim();
      const taken = [conversation.topic, ...conversation.tags].some(
        (existing) => normalize(existing) === normalize(tag),
      );
      if (!tag || taken) return conversation;
      return { ...conversation, tags: [...conversation.tags, tag] };
    }
  }
}

export function conversationReducer(
  conversations: MockConversation[],
  action: ConversationAction,
): MockConversation[] {
  return conversations.map((conversation) =>
    conversation.customerId === action.customerId
      ? updateConversation(conversation, action)
      : conversation,
  );
}
