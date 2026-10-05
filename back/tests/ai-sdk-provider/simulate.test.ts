import { expect, test } from '@playwright/test';
import {
  advisorActions,
  assertLocalDatabase,
  backfillFileName,
  parseBackfillArgs,
  parseDayArgs,
  runFileName,
} from '../../scripts/simulate/args';
import {
  allocateCategories,
  attachCustomers,
  buildBackfillPlan,
  CLOSE_HOUR,
  type CustomerFacts,
  dailyCount,
  daysBetween,
  isWeekend,
  messagesFor,
  motiveFor,
  OPEN_HOUR,
  quotasFor,
  VALID_USE_CASES,
} from '../../scripts/simulate/backfill-plan';
import { assertLocalBase } from '../../scripts/eval/guard';
import {
  allocateMix,
  buildPlan,
  MOTIVE_SHARES,
  MOTIVES,
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

test.describe('simulate: picking and flags', () => {
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
      concurrency: 1,
      dryRun: true,
    });
    expect(() => parseDayArgs(['--no-advisor-actions'])).toThrow();
    expect(runFileName('2026-09-30', null)).toBe('2026-09-30.json');
    expect(runFileName('2026-09-30', 'b')).toBe('2026-09-30-b.json');
    expect(() =>
      parseDayArgs(['--base', 'https://x.databricksapps.com']),
    ).toThrow();
    expect(() =>
      parseDayArgs(['--base', 'https://x.databricksapps.com', '--allow-prod']),
    ).not.toThrow();
  });

  test('day flags: --advisor-share and its split', () => {
    expect(parseDayArgs(['--dry-run']).advisorShare).toBe(0);
    expect(parseDayArgs(['--advisor-share', '0.5']).advisorShare).toBe(0.5);
    expect(() => parseDayArgs(['--advisor-share', '1.5'])).toThrow();
    expect(() => parseDayArgs(['--advisor-share', 'x'])).toThrow();
    expect(advisorActions(5, 0)).toEqual([null, null, null, null, null]);
    expect(advisorActions(5, 0.6)).toEqual([
      'resolved',
      'returned',
      'resolved',
      null,
      null,
    ]);
    expect(advisorActions(2, 1)).toEqual(['resolved', 'returned']);
  });

  test('prod guard accepts App Runner only with --allow-prod', () => {
    const aws = 'https://abc.us-west-2.awsapprunner.com';
    expect(() => assertLocalBase(aws)).toThrow();
    expect(() => assertLocalBase(aws, true)).not.toThrow();
    expect(() => assertLocalBase('https://evil.example.com', true)).toThrow();
  });
});

test.describe('simulate:backfill plan', () => {
  test('days, weekends and daily counts', () => {
    expect(daysBetween('2026-10-01', '2026-10-04')).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(() => daysBetween('2026-10-04', '2026-10-01')).toThrow();
    expect(isWeekend('2026-10-03')).toBe(true);
    expect(isWeekend('2026-10-02')).toBe(false);
    let r = 0;
    const rand = () => ((r = (r + 0.37) % 1), r);
    for (let i = 0; i < 20; i++) {
      const weekday = dailyCount('2026-10-01', rand);
      expect(weekday).toBeGreaterThanOrEqual(25);
      expect(weekday).toBeLessThanOrEqual(40);
      const weekend = dailyCount('2026-10-04', rand);
      expect(weekend).toBeGreaterThanOrEqual(12);
      expect(weekend).toBeLessThanOrEqual(20);
    }
  });

  test('the 65/20/15 split always adds up', () => {
    for (let n = 1; n <= 60; n++) {
      const c = allocateCategories(n);
      expect(c.ai + c.assisted + c.human).toBe(n);
    }
    expect(allocateCategories(20)).toEqual({ ai: 13, assisted: 4, human: 3 });
  });

  test('the plan is deterministic, in business hours, with known use cases', () => {
    const a = buildBackfillPlan({ from: '2026-10-01', to: '2026-10-04' });
    const b = buildBackfillPlan({ from: '2026-10-01', to: '2026-10-04' });
    expect(a).toEqual(b);
    expect(buildBackfillPlan({ from: '2026-10-01', to: '2026-10-04', seed: 'x' })).not.toEqual(a);
    const days = new Set(a.map((i) => i.day));
    expect([...days]).toEqual(daysBetween('2026-10-01', '2026-10-04'));
    for (const item of a) {
      // Lima is UTC-5.
      const limaHour = (item.startedAt.getUTCHours() + 24 - 5) % 24;
      expect(limaHour).toBeGreaterThanOrEqual(OPEN_HOUR);
      expect(limaHour).toBeLessThan(CLOSE_HOUR);
      // The day is Lima's: 19:00 there is already the next day in UTC.
      const limaDay = new Date(item.startedAt.getTime() - 5 * 3600_000)
        .toISOString()
        .slice(0, 10);
      expect(limaDay).toBe(item.day);
      if (item.useCase !== null) expect(VALID_USE_CASES.has(item.useCase)).toBe(true);
    }
    const share = (c: string) => a.filter((i) => i.category === c).length / a.length;
    expect(share('ai')).toBeGreaterThan(0.6);
    expect(share('human')).toBeGreaterThan(0.1);
  });

  test('every use case gets a customer of the right motive', () => {
    const plan = buildBackfillPlan({ from: '2026-10-01', to: '2026-10-01' });
    const quotas = quotasFor(plan);
    const assignments: Assignment[] = [];
    let i = 0;
    for (const [motive, n] of Object.entries(quotas) as Array<[Motive, number]>) {
      for (let k = 0; k < n; k++) assignments.push({ motive, customer: customer(i++) });
    }
    const paired = attachCustomers(plan, assignments);
    expect(paired).toHaveLength(plan.length);
    expect(new Set(paired.map((p) => p.customer.customerId)).size).toBe(plan.length);
    expect(() => attachCustomers(plan, [])).toThrow();
    expect(motiveFor('COMPLAINT')).toBe('reclamo');
    expect(motiveFor(null)).toBe('tecnico');
  });

  test("messages use the customer's real product and charge", () => {
    const facts: CustomerFacts = {
      customerId: 'CLI-X',
      name: 'Ana Pérez',
      product: { kind: 'card', last4: '4321', balance: 1234.5, limit: 5000, currency: 'MXN' },
      charge: { merchant: 'Oxxo', amount: 89.9, currency: 'MXN', date: '2026-09-20' },
      caseCategory: 'Cobro indebido',
    };
    const at = new Date('2026-10-01T15:00:00.000Z');
    const general = messagesFor(
      { day: '2026-10-01', category: 'ai', useCase: 'GENERAL_INQUIRY', language: 'es', startedAt: at },
      facts,
    );
    expect(general[1].text).toContain('4321');
    expect(general[1].text).toContain('1,234.50 MXN');
    expect(general.map((m) => m.sender)).toEqual(['customer', 'ai_agent', 'customer', 'ai_agent']);
    const complaint = messagesFor(
      { day: '2026-10-01', category: 'human', useCase: 'COMPLAINT', language: 'es', startedAt: at },
      facts,
    );
    expect(complaint[0].text).toContain('Oxxo');
    expect(complaint.some((m) => m.sender === 'human_agent')).toBe(true);
    expect(complaint.at(-1)?.sender).toBe('system');
    const status = messagesFor(
      { day: '2026-10-01', category: 'assisted', useCase: 'CASE_STATUS', language: 'pt', startedAt: at },
      facts,
    );
    expect(status[1].text).toContain('Cobro indebido');
    expect(status.at(-1)?.sender).toBe('ai_agent');
    for (let k = 1; k < complaint.length; k++) {
      expect(complaint[k].at.getTime()).toBeGreaterThan(complaint[k - 1].at.getTime());
    }
  });

  test('backfill flags and the database guard', () => {
    expect(parseBackfillArgs([])).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-04',
      dryRun: false,
      allowProd: false,
    });
    expect(() => parseBackfillArgs(['--cleanup'])).toThrow();
    expect(() => parseBackfillArgs(['--from', '2026-10-05', '--to', '2026-10-01'])).toThrow();
    expect(backfillFileName('2026-10-01', '2026-10-04')).toBe(
      'backfill-2026-10-01_2026-10-04.json',
    );
    expect(() => assertLocalDatabase(undefined, false)).toThrow();
    expect(() => assertLocalDatabase('postgres://u:p@db.example.com/x', false)).toThrow();
    expect(() => assertLocalDatabase('postgres://u:p@127.0.0.1:55432/x', false)).not.toThrow();
    expect(() => assertLocalDatabase(undefined, true)).not.toThrow();
  });
});

