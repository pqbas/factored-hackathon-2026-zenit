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

export type ConversationStatus = 'assistant' | 'waiting' | 'advisor' | 'resolved';

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  assistant: `Con ${ASSISTANT_NAME}`,
  waiting: 'Sin atender',
  advisor: 'En atención',
  resolved: 'Resuelto',
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
