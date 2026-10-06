import {
  getFraudDashboardAggregates,
  isDatabaseAvailable,
} from '@chat-template/db';
import { AnalyticsCache } from './analytics-cache';
import { aggregateFraudRows } from './fraud-dashboard';
import type { FraudOperational } from '../../packages/utils/src/fraud-dashboard';

// At most eight cached cohorts and one database query in flight per process.
const cohorts = new Map<string, AnalyticsCache<FraudOperational>>();
let tail = Promise.resolve();
export function cachedFraudOperations(
  window: { from: string; to: string; tz: string },
  force = false,
): FraudOperational {
  if (!isDatabaseAvailable()) return aggregateFraudRows([], 'unavailable');
  const key = JSON.stringify(window);
  let cache = cohorts.get(key);
  if (!cache) {
    if (cohorts.size >= 8) {
      const victim = [...cohorts].find(([, entry]) => !entry.updating);
      if (!victim) return aggregateFraudRows([], 'loading');
      cohorts.delete(victim[0]);
    }
    cache = new AnalyticsCache(
      async () => {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return aggregateFraudRows(await getFraudDashboardAggregates(window));
        } finally {
          release();
        }
      },
      Date.now,
      60_000,
      300_000,
      10_000,
    );
    cohorts.set(key, cache);
  }
  const { data, ...state } = cache.read(force);
  return {
    ...(data ??
      aggregateFraudRows([], state.lastRefreshFailed ? 'error' : 'loading')),
    cache: state,
  };
}
