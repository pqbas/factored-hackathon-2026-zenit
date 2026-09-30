import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  compareToMarkdown,
  type ComparedReport,
} from '../../scripts/eval/compare-report';
import { parseArgs, reportStem } from '../../scripts/eval/args';
import {
  caseChangesSchema,
  type EvalCase,
  evalCaseSchema,
} from '../../scripts/eval/types';

const EVAL = join(process.cwd(), 'scripts/eval');
const loadCases = (dir: string): EvalCase[] =>
  readdirSync(join(EVAL, dir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) =>
      evalCaseSchema.parse(
        JSON.parse(readFileSync(join(EVAL, dir, f), 'utf8')),
      ),
    );
const holdout = loadCases('cases-holdout');
const dev = loadCases('cases');

const says = (cases: typeof dev) =>
  cases.flatMap((c) => c.steps.flatMap((s) => ('say' in s ? [s.say] : [])));

test.describe('held-out cases', () => {
  test('20 cases H01..H20, each file named after its id', () => {
    expect(holdout.map((c) => c.id)).toEqual(
      Array.from(
        { length: 20 },
        (_, i) => `H${String(i + 1).padStart(2, '0')}`,
      ),
    );
    const files = readdirSync(join(EVAL, 'cases-holdout')).filter((f) =>
      f.endsWith('.json'),
    );
    expect(files.map((f) => f.split('-')[0]).sort()).toEqual(
      holdout.map((c) => c.id),
    );
  });

  test('the mix follows the dev set: every group, es and pt', () => {
    const groups = new Set(holdout.map((c) => c.group));
    expect(groups).toEqual(
      new Set(dev.filter((c) => !c.limitation).map((c) => c.group)),
    );
    expect(holdout.filter((c) => c.language === 'es')).toHaveLength(13);
    expect(holdout.filter((c) => c.language === 'pt')).toHaveLength(7);
    for (const outcome of ['R', 'A', 'D', 'F']) {
      expect(
        holdout.filter((c) => c.expected.outcome === outcome).length,
        outcome,
      ).toBeGreaterThan(0);
    }
    for (const c of holdout.filter((c) => c.expected.outcome === 'D')) {
      expect(c.expected.reason, c.id).toBeDefined();
      expect(c.expected.handoffFacts?.length, c.id).toBeGreaterThan(0);
    }
  });

  test('no message repeats one of the dev cases or the dev scenarios', () => {
    const scenarios = readdirSync(join(process.cwd(), 'scripts/scenarios'))
      .filter((f) => f.endsWith('.json'))
      .flatMap(
        (f) =>
          JSON.parse(
            readFileSync(join(process.cwd(), 'scripts/scenarios', f), 'utf8'),
          ).messages as string[],
      );
    const seen = new Set(
      [...says(dev), ...scenarios].map((m) => m.trim().toLowerCase()),
    );
    // Confirmations are shared by any flow.
    const generic = /^(sí, confirmo|sim, confirmo)$/i;
    for (const say of says(holdout)) {
      if (!generic.test(say)) {
        expect(seen.has(say.trim().toLowerCase()), say).toBe(false);
      }
    }
  });

  test('every held-out case changed since its freeze is on the record', () => {
    const { frozenAt, changes } = caseChangesSchema.parse(
      JSON.parse(readFileSync(join(EVAL, 'case-changes-holdout.json'), 'utf8')),
    );
    const changed = execFileSync(
      'git',
      ['diff', '--name-only', frozenAt, '--', 'scripts/eval/cases-holdout'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .map((path) => path.split('/').pop()?.split('-')[0]);
    const listed = new Set(changes.map((c) => c.caseId));
    for (const id of changed) expect(listed.has(id as string), id).toBe(true);
  });
});

test.describe('runner sets', () => {
  test('--set and --label pick the set and name the report', () => {
    const args = parseArgs(['--set', 'holdout', '--label', 'antes']);
    expect(args.set).toBe('holdout');
    expect(reportStem(args, '2026-09-29')).toBe('2026-09-29-holdout-llm-antes');
    expect(reportStem(parseArgs([]), '2026-09-29')).toBe('2026-09-29-llm');
    expect(() => parseArgs(['--set', 'prod'])).toThrow(/dev or holdout/);
    expect(() => parseArgs(['--label', 'Después'])).toThrow(/--label/);
  });
});

const ratio = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  rate: denominator ? numerator / denominator : null,
});

function report(pass: number): ComparedReport {
  return {
    meta: {
      date: '2026-09-29',
      commit: 'abcdef1234',
      promptVersion: 'p1',
      classifier: 'llm',
      sample: { cases: 20, runsPerCase: 3, runs: 60 },
    },
    metrics: {
      verdicts: ratio(pass, 60),
      safeAutoResolution: { safe: ratio(10, 60), attempted: ratio(30, 60) },
      containment: ratio(40, 60),
      escalation: {
        correct: ratio(15, 18),
        missing: ratio(3, 18),
        extra: ratio(0, 42),
      },
      unsafe: {
        claimed_action: ratio(0, 60),
        other_customer_data: ratio(1, 3),
      },
      latency: { runnerMs: { p50: 9000, p95: 13000 } },
      cost: { perAttemptedUsd: 0.0068, perSafeResolvedUsd: null },
      variability: { consistentCases: ratio(18, 20) },
      byLanguage: { es: { pasa: ratio(30, 39) }, pt: { pasa: ratio(15, 21) } },
    },
  };
}

test.describe('compareToMarkdown', () => {
  test('one column per report, "—" for a missing one', () => {
    const md = compareToMarkdown({
      devBefore: report(40),
      holdoutBefore: report(30),
    });
    expect(md).toContain(
      '| Métrica | Dev (40) antes | Dev (40) después | Holdout antes | Holdout después |',
    );
    expect(md).toContain(
      '| Corridas que pasan | 40/60 (66.7%) | — | 30/60 (50.0%) | — |',
    );
    expect(md).toContain('| Latencia p95 | 13.0 s | — | 13.0 s | — |');
    expect(md).toContain('| Hallazgos inseguros | 1 | — | 1 | — |');
    expect(md).toContain('| Costo por caso resuelto solo | sin datos |');
    expect(md).toContain('Medición offline, en local.');
  });
});
