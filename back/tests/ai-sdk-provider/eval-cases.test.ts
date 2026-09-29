import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { evalCaseSchema, type EvalCase } from '../../scripts/eval/types';

const DIR = join(process.cwd(), 'scripts/eval/cases');
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const cases: EvalCase[] = files.map((f) =>
  evalCaseSchema.parse(JSON.parse(readFileSync(join(DIR, f), 'utf8'))),
);
const forty = cases.filter((c) => !c.limitation);

test.describe('evaluation cases', () => {
  test('every file meets the EvalCase schema and is named after its id', () => {
    for (const f of files) {
      const parsed = evalCaseSchema.safeParse(
        JSON.parse(readFileSync(join(DIR, f), 'utf8')),
      );
      expect(parsed.success, f).toBe(true);
      expect(f.startsWith(`${(parsed.data as EvalCase).id}-`), f).toBe(true);
    }
  });

  test('40 cases plus L1 and L2, with no repeated ids', () => {
    expect(forty.map((c) => c.id)).toEqual(
      Array.from({ length: 40 }, (_, i) => String(i + 1).padStart(2, '0')),
    );
    expect(cases.filter((c) => c.limitation).map((c) => c.id)).toEqual([
      'L1',
      'L2',
    ]);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  test('the mix matches §7: 31 es / 9 pt; 17 R, 10 D, 13 the rest', () => {
    expect(forty.filter((c) => c.language === 'es')).toHaveLength(31);
    expect(forty.filter((c) => c.language === 'pt')).toHaveLength(9);
    expect(forty.filter((c) => c.expected.outcome === 'R')).toHaveLength(17);
    // #23 is D with silentAfter: §7 counts it as silence.
    const derivations = forty.filter(
      (c) => c.expected.outcome === 'D' && c.expected.silentAfter === undefined,
    );
    expect(derivations).toHaveLength(10);
    expect(forty.length - 17 - derivations.length).toBe(13);
  });

  test('every derivation declares its reason and the facts it needs', () => {
    for (const c of forty.filter((c) => c.expected.outcome === 'D')) {
      expect(c.expected.reason, c.id).toBeDefined();
      expect(c.expected.handoffFacts?.length, c.id).toBeGreaterThan(0);
    }
  });

  test('the 13 demo customers are all used, with the four segments', () => {
    const tokens = new Set(forty.map((c) => c.customer.token));
    for (const n of [
      'demo-mx-1',
      'demo-co-1',
      'demo-ar-1',
      'demo-mx-2',
      'demo-mx-3',
      'demo-co-2',
      'demo-ar-2',
      'demo-mx-4',
      'demo-co-3',
      'demo-ar-3',
      'demo-ar-4',
      'demo-mx-5',
      'demo-co-4',
    ]) {
      expect(tokens.has(n), n).toBe(true);
    }
    expect(new Set(forty.map((c) => c.customer.segment))).toEqual(
      new Set(['Basic', 'Plus', 'Premium', 'Student']),
    );
  });

  test('special cases use their token, and #23 is a known failure', () => {
    const byId = (id: string) => cases.find((c) => c.id === id) as EvalCase;
    expect(byId('37').customer.token).toBe('demo-expired');
    expect(byId('40').customer.token).toBe('demo-tool-down');
    expect(byId('23').knownFailure).toContain('silent-after-handoff');
    expect(byId('23').expected.silentAfter).toBe(byId('11').steps.length);
    expect(
      byId('24')
        .steps.map((s) => Object.keys(s)[0])
        .slice(-3),
    ).toEqual(['take', 'release', 'say']);
  });

  test('cases do not reuse the messages of the development scenarios', () => {
    const scenarios = readdirSync(join(process.cwd(), 'scripts/scenarios'))
      .filter((f) => f.endsWith('.json'))
      .flatMap(
        (f) =>
          JSON.parse(
            readFileSync(join(process.cwd(), 'scripts/scenarios', f), 'utf8'),
          ).messages as string[],
      );
    const dev = new Set(scenarios.map((m) => m.trim().toLowerCase()));
    // Confirmations and greetings are shared by any flow.
    const generic = /^(hola|sí, confirmo|sí, ese es|c|a|b|d)$/i;
    for (const c of cases) {
      for (const s of c.steps) {
        if ('say' in s && !generic.test(s.say)) {
          expect(dev.has(s.say.trim().toLowerCase()), `${c.id}: ${s.say}`).toBe(
            false,
          );
        }
      }
    }
  });
});
