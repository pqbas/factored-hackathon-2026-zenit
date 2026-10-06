import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RetentionOverview } from '@/pages/RetentionPage';
import { AnalyticsSourcePanel } from '@/components/analytics-source';
import {
  fetchRetention,
  retentionCopy,
  type RetentionData,
  type AnalyticsSource,
} from '@/lib/retention';
const data: RetentionData = {
  ruleVersion: 'retention_signals_v1',
  asOf: '2026-06-18',
  totalCustomers: 150000,
  eligibleCustomers: 114516,
  activityUnknown: 1,
  bands: [
    { band: 'high', total: 446 },
    { band: 'medium', total: 10916 },
    { band: 'watch', total: 47226 },
    { band: 'none', total: 55928 },
  ],
  countries: [],
  segments: [],
  signals: [],
  customers: [],
  perCountryBandLimit: 15,
};
const source: AnalyticsSource = {
  provider: 'databricks_sql',
  tables: ['workspace.bank_gold.customer_360'],
  status: 'loading',
  updating: true,
  updatedAt: null,
  lastAttemptAt: null,
  lastRefreshFailed: false,
  cacheSeconds: 600,
  statementId: null,
  durationMs: null,
};
afterEach(() => vi.unstubAllGlobals());
describe('retention signals and source states', () => {
  it('describes priority as rules and historical reference date, not a churn probability', () => {
    const html = renderToStaticMarkup(<RetentionOverview data={data} />);
    expect(html).toContain('2026-06-18');
    expect(html).toContain('no son abandonos confirmados');
    expect(html).toContain('114');
    expect(html).toContain('446');
    expect(html).toContain('No hay clientes en esta selección.');
    expect(html).not.toContain('Probabilidad');
  });
  it('shows a background update without inventing a success timestamp', () => {
    const html = renderToStaticMarkup(<AnalyticsSourcePanel source={source} />);
    expect(html).toContain('Actualizando en segundo plano');
    expect(html).toContain('Esperando la primera consulta');
    expect(html).not.toContain('Se conservó');
  });
  it('does not claim an expired result is still available', () => {
    const html = renderToStaticMarkup(
      <AnalyticsSourcePanel
        source={{
          ...source,
          updating: false,
          status: 'unavailable',
          lastRefreshFailed: true,
          updatedAt: '2026-10-05T00:00:00Z',
        }}
      />,
    );
    expect(html).toContain('No se pudo actualizar');
    expect(html).not.toContain('Se conservó el último');
  });
  it('has matching translation keys', () =>
    expect(Object.keys(retentionCopy(false))).toEqual(
      Object.keys(retentionCopy(true)),
    ));
  it('rejects unauthorized and malformed responses, accepts a cold cache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 403 })),
    );
    await expect(fetchRetention('/api')).rejects.toThrow('403');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await expect(fetchRetention('/api')).rejects.toThrow('Invalid');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ data: null, source })),
        ),
    );
    expect((await fetchRetention('/api')).data).toBeNull();
  });
});
