import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  DataOverview,
  ModelOverview,
  OperationOverview,
} from '@/components/fraud/dashboard';
import {
  fetchFraudDashboard,
  fraction,
  fraudDashboardUrl,
  type FraudOperational,
} from '@/lib/fraud-dashboard';
import { fraudCopy } from '@/lib/fraud-copy';
import snapshot from '../../../back/server/src/data/fraud-dashboard.json';

const empty: FraudOperational = {
  status: 'available',
  total: 0,
  scored: 0,
  alerts: 0,
  unavailable: 0,
  open: 0,
  closed: 0,
  byDay: [],
  byType: [],
  scoreBins: Array.from({ length: 10 }, (_, bin) => ({ bin, total: 0 })),
};
afterEach(() => vi.unstubAllGlobals());
describe('fraud dashboard evidence and states', () => {
  it('distinguishes missing denominators from a measured zero', () => {
    expect(fraction(0, 0)).toBeNull();
    expect(fraction(0, 5)).toBe(0);
  });
  it('shows real historical data and explicit missing-data quality', () => {
    const html = renderToStaticMarkup(<DataOverview snapshot={snapshot} />);
    expect(html).toContain('Prevalencia histórica');
    expect(html).toContain('Categoría del comercio');
    expect(html).toContain('Monto USD normalizado');
    expect(html).toContain('76.75');
  });
  it('does not present model precision as probability or a successful challenger', () => {
    const html = renderToStaticMarkup(<ModelOverview snapshot={snapshot} />);
    expect(html).toContain('0.0831');
    expect(html).toContain('Challenger descartado');
    expect(html).toContain('Decisiones automáticas desactivadas');
    expect(html).toContain('no precisión ni probabilidad');
  });
  it('shows an empty-case state with undefined coverage', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OperationOverview
          operational={empty}
          from="2026-10-05"
          to="2026-10-05"
        />
      </MemoryRouter>,
    );
    expect(html).toContain('Todavía no hay reclamos');
    expect(html).toContain('—');
  });
  it('does not display zero KPIs when the database is unavailable', () => {
    const html = renderToStaticMarkup(
      <OperationOverview
        operational={{ ...empty, status: 'unavailable' }}
        from="2026-10-05"
        to="2026-10-05"
      />,
    );
    expect(html).toContain('no está disponible');
    expect(html).not.toContain('Cobertura de predicción');
  });
  it('has the same translations in Spanish and Portuguese', () => {
    expect(Object.keys(fraudCopy('es')).sort()).toEqual(
      Object.keys(fraudCopy('pt')).sort(),
    );
  });
  it('encodes query parameters and rejects unauthorized or malformed responses', async () => {
    expect(
      fraudDashboardUrl({
        from: '2026-10-01',
        to: '2026-10-05',
        tz: 'America/Lima',
      }),
    ).toContain('America%2FLima');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 403 })),
    );
    await expect(fetchFraudDashboard('/api')).rejects.toThrow('403');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    );
    await expect(fetchFraudDashboard('/api')).rejects.toThrow('Invalid');
  });
  it('rejects counts that would overstate coverage', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              snapshot,
              operational: { ...empty, total: 1, scored: 2, open: 1 },
            }),
          ),
        ),
    );
    await expect(fetchFraudDashboard('/api')).rejects.toThrow('Inconsistent');
  });
});
