import { expect, test } from '@playwright/test';
import { parseDayArgs, runFileName } from '../../scripts/simulate/args';
import {
  allocateMix,
  buildPlan,
  MOTIVE_SHARES,
  MOTIVES,
  planAdvisorActions,
  type Assignment,
  type Motive,
  type SimCustomer,
} from '../../scripts/simulate/conversations';
import { assign } from '../../scripts/simulate/pick';

function customer(i: number): SimCustomer {
  return {
    customerId: `CLI-T${i}`,
    firstName: `Nombre${i}`,
    country: 'México',
    cardLast4: String(1000 + i),
    savingsLast4: String(2000 + i),
    charge: {
      merchant: `Comercio ${i}`,
      amount: 10.5 + i,
      currency: 'USD',
      date: '2026-06-08',
      last4: String(1000 + i),
    },
    cases: [{ id: `K${i}`, category: `Categoria${i}`, status: 'Abierto' }],
  };
}

function assignments(count: number): Assignment[] {
  const mix = allocateMix(count);
  const out: Assignment[] = [];
  let i = 0;
  for (const motive of MOTIVES) {
    for (let n = 0; n < mix[motive]; n++) {
      out.push({ motive, customer: customer(i++) });
    }
  }
  return out;
}

test.describe('simulate: mix', () => {
  for (const count of [1, 5, 7, 13, 50, 99, 100, 101, 250]) {
    test(`allocation of ${count} sums exactly and follows the shares (±1)`, () => {
      const mix = allocateMix(count);
      expect(MOTIVES.reduce((sum, m) => sum + mix[m], 0)).toBe(count);
      const total = MOTIVES.reduce((sum, m) => sum + MOTIVE_SHARES[m], 0);
      for (const m of MOTIVES) {
        expect(
          Math.abs(mix[m] - (count * MOTIVE_SHARES[m]) / total),
          m,
        ).toBeLessThan(1);
      }
    });
  }

  test('100 conversations are exactly the call center mix', () => {
    expect(allocateMix(100)).toEqual({
      transaccional: 35,
      producto: 22,
      reclamo: 12,
      estado_reclamo: 5,
      tecnico: 15,
      comercial: 8,
      retencion: 3,
    });
  });
});

test.describe('simulate: templates', () => {
  const plan = buildPlan(assignments(100), '2026-09-30');

  test('every conversation has 2 to 4 messages', () => {
    for (const p of plan) {
      expect(
        p.messages.length,
        `${p.motive} #${p.index}`,
      ).toBeGreaterThanOrEqual(2);
      expect(p.messages.length, `${p.motive} #${p.index}`).toBeLessThanOrEqual(
        4,
      );
      for (const m of p.messages) expect(m.trim()).not.toBe('');
    }
  });

  test('messages carry the customer data of their motive', () => {
    for (const p of plan) {
      const text = p.messages.join('\n');
      const c = p.customer;
      if (p.motive === 'transaccional' || p.motive === 'producto') {
        // The first message names the product's last 4.
        const first = p.messages[0];
        expect(
          first.includes(c.cardLast4 as string) ||
            first.includes(c.savingsLast4 as string),
          first,
        ).toBe(true);
      }
      if (p.motive === 'reclamo') {
        const charge = c.charge as NonNullable<SimCustomer['charge']>;
        expect(text).toContain(charge.merchant);
        expect(text).toContain(charge.amount.toFixed(2));
        expect(text).toContain('08/06/2026');
        expect(text).toContain(charge.last4);
        expect(p.messages).toHaveLength(3);
      }
      if (p.motive === 'estado_reclamo') {
        expect(text).toContain(c.cases[0].category as string);
      }
      if (p.motive === 'retencion') {
        expect(p.messages[0]).toContain(c.cardLast4 as string);
      }
    }
  });

  test('some consultas end with a goodbye', () => {
    const goodbyes = plan.filter((p) => p.goodbye);
    expect(goodbyes.length).toBeGreaterThan(5);
    for (const p of goodbyes) {
      expect(['transaccional', 'producto']).toContain(p.motive);
      expect(p.messages.at(-1)).toMatch(/gracias|obrigado|listo|pronto/i);
    }
  });

  test('about 20% are in Portuguese', () => {
    expect(plan.filter((p) => p.language === 'pt')).toHaveLength(20);
    expect(
      buildPlan(assignments(7), 'x').filter((p) => p.language === 'pt'),
    ).toHaveLength(1);
  });

  test('the same seed gives the same plan; another seed a different one', () => {
    const a = assignments(100);
    expect(buildPlan(a, 'seed-1')).toEqual(buildPlan(a, 'seed-1'));
    expect(buildPlan(a, 'seed-1')).not.toEqual(buildPlan(a, 'seed-2'));
  });
});

test.describe('simulate: advisor actions and picking', () => {
  test('advisor actions are 40/20/20/20 and deterministic', () => {
    const actions = planAdvisorActions(50, '2026-09-30');
    expect(actions).toHaveLength(50);
    const count = (a: string) => actions.filter((x) => x === a).length;
    expect(count('resolved')).toBe(20);
    expect(count('returned_to_agent')).toBe(10);
    expect(count('taken')).toBe(10);
    expect(count('none')).toBe(10);
    expect(planAdvisorActions(50, '2026-09-30')).toEqual(actions);
    expect(planAdvisorActions(3, 'x')).toHaveLength(3);
  });

  test('assign gives each customer one motive and reports shortfalls', () => {
    const plain = { ...customer(0), charge: null, cases: [], cardLast4: null };
    const quotas = { ...allocateMix(10) } as Record<Motive, number>;
    const rich = Array.from({ length: 30 }, (_, i) => customer(i + 1));
    const { assignments: got, shortfall } = assign([plain, ...rich], quotas);
    expect(shortfall).toEqual({});
    expect(got).toHaveLength(10);
    expect(new Set(got.map((a) => a.customer.customerId)).size).toBe(10);

    const short = assign([plain], quotas);
    expect(short.shortfall.reclamo).toBe(quotas.reclamo);
  });

  test('day flags: defaults, the day file and the prod guard', () => {
    const args = parseDayArgs(['--dry-run']);
    expect(args).toMatchObject({
      count: 100,
      concurrency: 3,
      advisorActions: true,
      dryRun: true,
    });
    expect(parseDayArgs(['--no-advisor-actions']).advisorActions).toBe(false);
    expect(runFileName('2026-09-30', null)).toBe('2026-09-30.json');
    expect(runFileName('2026-09-30', 'b')).toBe('2026-09-30-b.json');
    expect(() =>
      parseDayArgs(['--base', 'https://x.databricksapps.com']),
    ).toThrow();
    expect(() =>
      parseDayArgs(['--base', 'https://x.databricksapps.com', '--allow-prod']),
    ).not.toThrow();
  });
});
