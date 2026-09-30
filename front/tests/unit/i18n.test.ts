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
