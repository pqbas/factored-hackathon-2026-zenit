import { describe, expect, it } from 'vitest';

import { defaultLang, langFromCustomerLabel, MESSAGES } from '@/lib/i18n';

describe('defaultLang', () => {
  it("follows the demo customer's country first", () => {
    expect(defaultLang({ customerLabel: 'Ana · Brasil', navigatorLanguage: 'es-MX' })).toBe('pt');
    expect(defaultLang({ customerLabel: 'Santiago · México', navigatorLanguage: 'pt-BR' })).toBe('es');
  });

  it('then the browser, then Spanish', () => {
    expect(defaultLang({ customerLabel: null, navigatorLanguage: 'pt-BR' })).toBe('pt');
    expect(defaultLang({ customerLabel: 'Simulación', navigatorLanguage: 'en-US' })).toBe('es');
    expect(defaultLang({})).toBe('es');
  });
});

describe('langFromCustomerLabel', () => {
  it('reads the country after the dot', () => {
    expect(langFromCustomerLabel('Ana · Brazil')).toBe('pt');
    expect(langFromCustomerLabel('Javier · Colombia')).toBe('es');
    expect(langFromCustomerLabel('Cliente cerrado')).toBeNull();
  });
});

describe('MESSAGES', () => {
  it('has the same texts in both languages', () => {
    expect(Object.keys(MESSAGES.pt).sort()).toEqual(Object.keys(MESSAGES.es).sort());
    expect(MESSAGES.pt.actions).toHaveLength(MESSAGES.es.actions.length);
  });

  it('greets by the hour', () => {
    expect(MESSAGES.es.greeting(9)).toBe('Buenos días');
    expect(MESSAGES.es.greeting(21)).toBe('Buenas noches');
    expect(MESSAGES.pt.greeting(9)).toBe('Bom dia');
    expect(MESSAGES.pt.greeting(15)).toBe('Boa tarde');
  });
});

describe('MESSAGES', () => {
  // Every key of es exists in pt at every level, and arrays have the same length.
  function sameShape(a: unknown, b: unknown, path: string): string[] {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b)) return [path];
      const rest = a.flatMap((item, i) => (i < b.length ? sameShape(item, b[i], `${path}[${i}]`) : []));
      return a.length === b.length ? rest : [path, ...rest];
    }
    if (typeof a === 'object' && a !== null) {
      if (typeof b !== 'object' || b === null) return [path];
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      return [...keys].flatMap((key) => {
        if (!(key in a) || !(key in b)) return [`${path}.${key}`];
        return sameShape(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          `${path}.${key}`,
        );
      });
    }
    return typeof a === typeof b ? [] : [path];
  }

  it('has the same keys in es and pt at every level', () => {
    expect(sameShape(MESSAGES.es, MESSAGES.pt, 'messages')).toEqual([]);
  });
});
