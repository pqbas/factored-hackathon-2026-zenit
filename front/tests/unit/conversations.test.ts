import { describe, expect, it } from 'vitest';

import {
  formatListTime,
  getInitials,
  groupByDay,
  matchesQuery,
} from '@/lib/conversations';

// Fixed reference point so "Hoy"/"Ayer" don't depend on the real clock.
const NOW = new Date(2026, 8, 28, 12, 0, 0);

function localIso(day: number, hour = 9, minute = 0): string {
  return new Date(2026, 8, day, hour, minute, 0, 0).toISOString();
}

describe('getInitials', () => {
  it('returns two letters for a single word', () => {
    expect(getInitials('Ana')).toBe('AN');
  });

  it('uses first and last word, and the local part of an email', () => {
    expect(getInitials('Santiago Martínez')).toBe('SM');
    expect(getInitials('santiago.martinez@banco.test')).toBe('SM');
  });
});

describe('matchesQuery', () => {
  it('ignores case and accents across fields', () => {
    expect(matchesQuery('DANIELA', 'daniela@banco.test')).toBe(true);
    expect(matchesQuery('limite', null, 'Aumento de límite')).toBe(true);
    expect(matchesQuery('javier', 'ana@banco.test')).toBe(false);
  });

  it('matches everything for an empty query', () => {
    expect(matchesQuery('  ', null)).toBe(true);
  });
});

describe('groupByDay', () => {
  it('labels items as Hoy, Ayer, and by date otherwise', () => {
    const items = [
      { id: '1', sentAt: localIso(26) },
      { id: '2', sentAt: localIso(27) },
      { id: '3', sentAt: localIso(28, 8) },
      { id: '4', sentAt: localIso(28, 9) },
    ];
    const groups = groupByDay(items, NOW);
    expect(groups.map((g) => g.label)).toEqual(['26 de septiembre', 'Ayer', 'Hoy']);
    expect(groups[2].items).toHaveLength(2);
  });
});

describe('formatListTime', () => {
  it('returns HH:mm today, "Ayer" yesterday and the date otherwise', () => {
    expect(formatListTime(localIso(28, 9, 30), NOW)).toBe('09:30');
    expect(formatListTime(localIso(27, 9, 30), NOW)).toBe('Ayer');
    expect(formatListTime(localIso(20, 9, 30), NOW)).toBe('20/09/2026');
  });
});
