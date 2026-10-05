import { test, expect } from '@playwright/test';
import { createAnalyticsWarehouseReader } from '../../server/src/analytics-warehouse';
const success = () =>
  new Response(
    JSON.stringify({
      statement_id: 'fixture',
      status: { state: 'SUCCEEDED' },
      manifest: {
        schema: { columns: [{ name: 'total' }] },
        total_chunk_count: 1,
      },
      result: { data_array: [['42']] },
    }),
  );
test('warehouse queries are serialized, bounded, read-only and carry limits', async () => {
  let active = 0,
    max = 0,
    calls = 0;
  const read = createAnalyticsWarehouseReader({
    authenticate: async () => ({
      token: 'unit-test-only',
      host: 'https://fixture.invalid',
    }),
    now: Date.now,
    pause: async () => {},
    request: async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      expect(body).toMatchObject({
        row_limit: 1000,
        byte_limit: 1000000,
        disposition: 'INLINE',
      });
      active++;
      max = Math.max(max, active);
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return success();
    },
  });
  const results = await Promise.all([
    read('SELECT count(*) AS total FROM example'),
    read('WITH t AS (SELECT 1) SELECT * FROM t'),
  ]);
  expect(max).toBe(1);
  expect(calls).toBe(2);
  expect(results[0].rows).toEqual([{ total: '42' }]);
  for (const statement of [
    'DELETE FROM t',
    'SELECT 1; DROP TABLE t',
    'SELECT 1 -- comment',
    'WITH t AS (DELETE FROM t) SELECT 1',
  ])
    await expect(read(statement)).rejects.toThrow('read-only');
  expect(calls).toBe(2);
});
test('truncated results are cancelled and never accepted as a smaller cohort', async () => {
  let cancelled = false;
  const read = createAnalyticsWarehouseReader({
    authenticate: async () => ({
      token: 'unit-test-only',
      host: 'https://fixture.invalid',
    }),
    now: Date.now,
    pause: async () => {},
    request: async (url) => {
      if (String(url).endsWith('/cancel')) {
        cancelled = true;
        return new Response('{}');
      }
      const body = await success().json();
      body.manifest.truncated = true;
      return new Response(JSON.stringify(body));
    },
  });
  await expect(read('SELECT 1')).rejects.toThrow('incomplete');
  expect(cancelled).toBe(true);
});
test('polling deadline cancels the outstanding query and releases the queue', async () => {
  let time = 0,
    cancelled = false;
  const read = createAnalyticsWarehouseReader({
    authenticate: async () => ({
      token: 'unit-test-only',
      host: 'https://fixture.invalid',
    }),
    now: () => time,
    pause: async () => {
      time += 76000;
    },
    request: async (url) => {
      if (String(url).endsWith('/cancel')) {
        cancelled = true;
        return new Response('{}');
      }
      return new Response(
        JSON.stringify({
          statement_id: 'fixture',
          status: { state: 'RUNNING' },
        }),
      );
    },
  });
  await expect(read('SELECT 1')).rejects.toThrow('deadline');
  expect(cancelled).toBe(true);
});
