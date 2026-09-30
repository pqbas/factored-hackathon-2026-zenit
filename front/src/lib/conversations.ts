import { ASSISTANT_NAME } from '@/lib/assistant';
// Pure display helpers for the advisor console: no side effects, no fetch.

import { format, isSameDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

// "Santiago Martínez" -> "SM"; "ana@banco.test" -> "AN"; "Ana" -> "AN".
export function getInitials(name: string): string {
  const words = name
    .split('@')[0]
    .split(/[\s._-]+/)
    .filter((word) => /[a-zA-Z]/.test(word));
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

// Case- and accent-insensitive match of any of the given fields.
export function matchesQuery(query: string, ...fields: (string | null)[]): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  return fields.some((field) => field && normalize(field).includes(needle));
}

// Deterministic avatar color per bank customer, so the same customer always
// gets the same color, in the list and in the open chat. Soft hues, no grays;
// the lighter ones go a step darker so the white initials stay readable.
const AVATAR_COLORS = [
  'bg-linear-to-b from-rose-500 to-rose-600',
  'bg-linear-to-b from-orange-500 to-orange-600',
  'bg-linear-to-b from-amber-600 to-amber-700',
  'bg-linear-to-b from-emerald-600 to-emerald-700',
  'bg-linear-to-b from-teal-600 to-teal-700',
  'bg-linear-to-b from-sky-600 to-sky-700',
  'bg-linear-to-b from-indigo-500 to-indigo-600',
  'bg-linear-to-b from-violet-500 to-violet-600',
];

export function avatarColor(key: string): string {
  // FNV-1a: similar ids (CUS000123, CUS000132) land on different colors.
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// The bank customer behind a chat; the app user only when there's none (in
// prod every evaluation chat comes from the same app user). customerId first:
// the back builds customerKey from it when it exists.
export function avatarKeyOf(chat: {
  customerId?: string | null;
  customerKey?: string | null;
  userId: string;
}): string {
  return chat.customerId || chat.customerKey || chat.userId;
}

export type ConversationStatus = 'assistant' | 'waiting' | 'advisor' | 'resolved';

// The four states a conversation is always in (docs/flujo-atencion.md §5).
export const STATUS_LABEL: Record<ConversationStatus, string> = {
  assistant: 'Con AI',
  waiting: 'En espera',
  advisor: 'Con asesor',
  resolved: 'Resuelta',
};

export type DayGroup<T> = {
  label: string;
  items: T[];
};

export function groupByDay<T extends { sentAt: string }>(
  items: T[],
  now: Date,
): DayGroup<T>[] {
  const yesterday = subDays(now, 1);
  const groups: DayGroup<T>[] = [];

  for (const item of items) {
    const date = new Date(item.sentAt);
    const label = isSameDay(date, now)
      ? 'Hoy'
      : isSameDay(date, yesterday)
        ? 'Ayer'
        : format(date, "d 'de' MMMM", { locale: es });

    const currentGroup = groups[groups.length - 1];
    if (currentGroup && currentGroup.label === label) {
      currentGroup.items.push(item);
    } else {
      groups.push({ label, items: [item] });
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
