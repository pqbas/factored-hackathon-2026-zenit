import type postgres from 'postgres';
import {
  type Assignment,
  MOTIVES,
  type Motive,
  type SimCustomer,
} from './conversations';

// Picks the day's customers from bank_ro (read-only copies in Lakebase).
// customer_transactions has millions of rows: it is only read per customer, by
// its primary key (customer_id first), never scanned. No import.meta.

export const DEMO_CUSTOMER_IDS = [
  'CLI-FLEUCGTWGAHL',
  'CLI-7MPS3ZOPSN4Q',
  'CLI-714PN0OOE0WX',
  'CLI-0IY07CEBUL79',
  'CLI-OAZTV7GG5M0D',
  'CLI-TVX8Q10GJDTW',
  'CLI-2MM9EXMOO8KD',
  'CLI-01OSDSMM4FX2',
  'CLI-JLLEM8RQT11E',
  'CLI-MO9NTQLU8K63',
  'CLI-BTHO9TGJDB68',
  'CLI-MA350GCK64W1',
  'CLI-2UJ5P5LESPCJ',
  // The closed-customer demo.
  'CLI-02Y493OHFA18',
];

type Sql = postgres.Sql;

// Which customers can hold each motive (what its template needs).
export function eligible(motive: Motive, c: SimCustomer): boolean {
  switch (motive) {
    case 'transaccional':
    case 'producto':
      return c.cardLast4 !== null || c.savingsLast4 !== null;
    case 'reclamo':
      return c.charge !== null;
    case 'estado_reclamo':
      return c.cases.length > 0;
    case 'retencion':
      return c.cardLast4 !== null;
    case 'tecnico':
    case 'comercial':
      return true;
  }
}

// The most demanding motives first, so the easy ones take what is left.
const ORDER: Motive[] = [
  'reclamo',
  'estado_reclamo',
  'retencion',
  'transaccional',
  'producto',
  'comercial',
  'tecnico',
];

// Each candidate holds at most one motive. Pure: shortfall lists what could
// not be filled (a short sample), in motives.
export function assign(
  candidates: SimCustomer[],
  quotas: Record<Motive, number>,
): { assignments: Assignment[]; shortfall: Partial<Record<Motive, number>> } {
  const used = new Set<string>();
  const assignments: Assignment[] = [];
  const shortfall: Partial<Record<Motive, number>> = {};
  for (const motive of ORDER) {
    let missing = quotas[motive];
    for (const c of candidates) {
      if (missing === 0) break;
      if (used.has(c.customerId) || !eligible(motive, c)) continue;
      used.add(c.customerId);
      assignments.push({ motive, customer: c });
      missing--;
    }
    if (missing > 0) shortfall[motive] = missing;
  }
  // Back to the canonical motive order, for a stable plan.
  assignments.sort(
    (a, b) => MOTIVES.indexOf(a.motive) - MOTIVES.indexOf(b.motive),
  );
  return { assignments, shortfall };
}

type Row = Record<string, string | number | null>;

// A random sample of active customers not used before, and each one's data.
export async function sampleCustomers(
  sql: Sql,
  size: number,
  exclude: string[],
  seed: number,
): Promise<SimCustomer[]> {
  const people = (await sql.begin(async (transaction) => {
    // The transaction type loses the call signature in postgres' types.
    const tx = transaction as unknown as Sql;
    // The seed makes the sample repeatable on the same data.
    await tx`SELECT setseed(${seed})`;
    return tx`
      SELECT c.customer_id, c.first_name, c.country
      FROM bank_ro.customer_360 c
      WHERE c.customer_status = 'Active'
        AND c.customer_id <> ALL(${exclude}::text[])
        AND NOT EXISTS (
          SELECT 1 FROM bank_sessions.sim_sessions s
          WHERE s.customer_id = c.customer_id
        )
      ORDER BY random()
      LIMIT ${size}`;
  })) as unknown as Row[];
  if (people.length === 0) return [];
  const ids = people.map((p) => String(p.customer_id));

  // = ANY(...) on customer_id uses the primary keys (customer_id first).
  const products = (await sql`
    SELECT customer_id, product_type, product_number_last4
    FROM bank_ro.customer_products
    WHERE customer_id = ANY(${ids}::text[])
      AND product_status = 'Active'
      AND product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')
      AND coalesce(product_number_last4, '') <> ''
    ORDER BY customer_id, product_id`) as unknown as Row[];
  const cases = (await sql`
    SELECT customer_id, complaint_id, category, status
    FROM bank_ro.customer_cases
    WHERE customer_id = ANY(${ids}::text[])
    ORDER BY customer_id, creation_date DESC`) as unknown as Row[];
  // The latest charge with a merchant on an active credit card, per customer:
  // one indexed probe each (LATERAL), not a scan of the table.
  const charges = (await sql`
    SELECT c.customer_id, t.transaction_date::date::text AS day, t.merchant_name,
           t.amount, t.currency, t.last4
    FROM unnest(${ids}::text[]) AS c(customer_id)
    CROSS JOIN LATERAL (
      SELECT t.transaction_date, t.merchant_name, t.amount::float8 AS amount,
             t.currency, p.product_number_last4 AS last4
      FROM bank_ro.customer_transactions t
      JOIN bank_ro.customer_products p
        ON p.customer_id = t.customer_id AND p.product_id = t.product_id
      WHERE t.customer_id = c.customer_id
        AND p.product_type = 'Tarjeta Crédito'
        AND p.product_status = 'Active'
        AND coalesce(p.product_number_last4, '') <> ''
        AND coalesce(t.merchant_name, '') <> ''
        AND t.amount IS NOT NULL
        AND t.transaction_date IS NOT NULL
      ORDER BY t.transaction_date DESC
      LIMIT 1
    ) t`) as unknown as Row[];

  return people.map((p) => {
    const id = String(p.customer_id);
    const mine = products.filter((r) => r.customer_id === id);
    const charge = charges.find((r) => r.customer_id === id);
    return {
      customerId: id,
      firstName: String(p.first_name ?? ''),
      country: String(p.country ?? ''),
      cardLast4:
        (mine.find((r) => r.product_type === 'Tarjeta Crédito')
          ?.product_number_last4 as string | undefined) ?? null,
      savingsLast4:
        (mine.find((r) => r.product_type === 'Cuenta Ahorro')
          ?.product_number_last4 as string | undefined) ?? null,
      charge: charge
        ? {
            merchant: String(charge.merchant_name),
            amount: Number(charge.amount),
            currency: String(charge.currency ?? ''),
            date: String(charge.day),
            last4: String(charge.last4),
          }
        : null,
      cases: cases
        .filter((r) => r.customer_id === id)
        .map((r) => ({
          id: String(r.complaint_id),
          category: (r.category as string | null) ?? null,
          status: (r.status as string | null) ?? null,
        })),
    };
  });
}

// Customers for a day: samples grow until every quota is filled or the
// rounds run out. Only rare motives (a charge with merchant, cases) need it.
export async function pickCustomers(
  sql: Sql,
  quotas: Record<Motive, number>,
  seed: number,
  extraExclude: string[] = [],
) {
  const total = MOTIVES.reduce((sum, m) => sum + quotas[m], 0);
  let size = Math.max(total * 3, 30);
  let result = assign([], quotas);
  for (let round = 0; round < 4; round++) {
    const sample = await sampleCustomers(
      sql,
      size,
      [...DEMO_CUSTOMER_IDS, ...extraExclude],
      seed,
    );
    result = assign(sample, quotas);
    if (Object.keys(result.shortfall).length === 0) break;
    // The whole population fit in the sample: a bigger one adds nothing.
    if (sample.length < size) break;
    size *= 3;
  }
  return result;
}
