import { bankQuery } from './bank-db';

export type SimCustomer = {
  token: string;
  customerId: string;
  country: string | null;
};

const SIM_PREFIX = 'sim-';

// The customer of a simulation session (bank_sessions.sim_sessions, written by
// scripts/simulate). Fixed query by token; an expired or missing row, or a
// database error, resolves to nobody (fails closed).
export async function findSimCustomer(
  token: string,
): Promise<SimCustomer | undefined> {
  if (!token.startsWith(SIM_PREFIX)) return undefined;
  try {
    const rows = await bankQuery(
      'SELECT customer_id, country, expires_at FROM bank_sessions.sim_sessions WHERE token = $1',
      [token],
    );
    const row = rows[0];
    if (!row?.customer_id || !row.expires_at) return undefined;
    if (new Date(row.expires_at).getTime() <= Date.now()) return undefined;
    return { token, customerId: row.customer_id, country: row.country };
  } catch (error) {
    console.warn('[sim-sessions] Lookup failed, token not resolved:', error);
    return undefined;
  }
}
