import { test, expect } from '@playwright/test';
import { AnalyticsCache } from '../../server/src/analytics-cache';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test('cold reads are immediate and concurrent readers share one loader, including epoch zero', async () => {
  const pending = deferred<number>();
  let calls = 0;
  const cache = new AnalyticsCache(
    () => {
      calls++;
      return pending.promise;
    },
    () => 0,
  );
  for (let i = 0; i < 100; i++) expect(cache.read().status).toBe('loading');
  await Promise.resolve();
  expect(calls).toBe(1);
  pending.resolve(0);
  await cache.settled();
  expect(cache.read()).toMatchObject({
    data: 0,
    status: 'fresh',
    updatedAt: '1970-01-01T00:00:00.000Z',
    updating: false,
  });
  expect(calls).toBe(1);
});
test('stale reads preserve data; failed refreshes preserve the success timestamp and back off', async () => {
  let time = 0,
    calls = 0;
  const pending = deferred<number>();
  const cache = new AnalyticsCache(
    () => (++calls === 1 ? Promise.resolve(42) : pending.promise),
    () => time,
    100,
    1000,
    50,
  );
  cache.read();
  await cache.settled();
  time = 100;
  expect(cache.read()).toMatchObject({
    data: 42,
    status: 'stale',
    updating: true,
  });
  pending.reject(new Error('fixture timeout'));
  await cache.settled();
  expect(cache.read()).toMatchObject({
    data: 42,
    lastRefreshFailed: true,
    updatedAt: '1970-01-01T00:00:00.000Z',
  });
  for (let i = 0; i < 100; i++) cache.read(true);
  expect(calls).toBe(2);
  time = 1001;
  expect(cache.read().data).toBeNull();
  await cache.settled();
});
test('manual refresh requests respect cooldown even when previous results were successful', async () => {
  let time = 1000,
    calls = 0;
  const cache = new AnalyticsCache(
    async () => ++calls,
    () => time,
    1000,
    5000,
    100,
  );
  cache.read();
  await cache.settled();
  for (let i = 0; i < 100; i++) cache.read(true);
  expect(calls).toBe(1);
  time += 100;
  cache.read(true);
  await cache.settled();
  expect(calls).toBe(2);
});
test('a failed first read returns unavailable, not a fabricated zero', async () => {
  const cache = new AnalyticsCache(async () => {
    throw new Error('fixture');
  });
  cache.read();
  await cache.settled();
  expect(cache.read()).toMatchObject({
    data: null,
    status: 'unavailable',
    lastRefreshFailed: true,
    updatedAt: null,
  });
});
