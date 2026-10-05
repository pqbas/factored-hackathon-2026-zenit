import type { FraudDashboard } from '../../../back/packages/utils/src/fraud-dashboard';
export type {
  FraudDashboard,
  FraudMetrics,
  FraudSegment,
  FraudSnapshot,
  FraudOperational,
} from '../../../back/packages/utils/src/fraud-dashboard';

export function fraction(
  numerator: number,
  denominator: number,
): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function fraudDashboardUrl(window: {
  from: string;
  to: string;
  tz: string;
}): string {
  return `/api/advisor/fraud-dashboard?${new URLSearchParams(window)}`;
}

// Missing operational storage must remain unavailable, rather than a fabricated zero.
export async function fetchFraudDashboard(
  url: string,
): Promise<FraudDashboard> {
  const response = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(15_000) });
  if (!response.ok)
    throw new Error(`Fraud dashboard request failed (${response.status})`);
  const body = await response.json();
  if (
    body?.snapshot?.schemaVersion !== 1 ||
    !Array.isArray(body?.snapshot?.model?.versions) ||
    !Array.isArray(body?.snapshot?.dataset?.countries) ||
    !['available', 'unavailable', 'error', 'loading'].includes(body?.operational?.status)
  ) {
    throw new Error('Invalid fraud dashboard response');
  }
  for (const key of [
    'total',
    'scored',
    'alerts',
    'unavailable',
    'open',
    'closed',
  ]) {
    const value = body.operational[key];
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('Invalid operational count');
  }
  if (
    body.operational.scored + body.operational.unavailable !==
      body.operational.total ||
    body.operational.open + body.operational.closed !==
      body.operational.total ||
    body.operational.alerts > body.operational.scored
  )
    throw new Error('Inconsistent operational counts');
  return body;
}
