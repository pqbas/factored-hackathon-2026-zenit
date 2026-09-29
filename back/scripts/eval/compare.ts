/**
 * The final comparison: the dev set (the 40 cases of §7, which the agent was
 * tuned on) before and after, next to the held-out set, which the agent's
 * team never saw. Reads reports written by `npm run eval`.
 *
 *   npm run eval:compare -- --dev-before results/2026-09-29-llm.json \
 *     --dev-after results/…-llm-despues.json \
 *     --holdout-before results/…-holdout-llm-antes.json \
 *     --holdout-after results/…-holdout-llm-despues.json [--out compare.md]
 *
 * Every report is optional: a missing one shows as "—".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Ratio = { numerator: number; denominator: number; rate: number | null };

// The part of a report (report.ts) the comparison reads.
export type ComparedReport = {
  meta: {
    date: string;
    commit: string;
    promptVersion: string | null;
    classifier: string | null;
    sample: { cases: number; runsPerCase: number; runs: number };
  };
  metrics: {
    verdicts: Ratio;
    safeAutoResolution: { safe: Ratio; attempted: Ratio };
    containment: Ratio;
    escalation: { correct: Ratio; missing: Ratio; extra: Ratio };
    unsafe: Record<string, Ratio>;
    latency: { runnerMs: { p50: number | null; p95: number | null } };
    cost: { perAttemptedUsd: number | null; perSafeResolvedUsd: number | null };
    variability: { consistentCases: Ratio };
    byLanguage: Record<string, { pasa: Ratio }>;
  };
};

export type Comparison = {
  devBefore?: ComparedReport;
  devAfter?: ComparedReport;
  holdoutBefore?: ComparedReport;
  holdoutAfter?: ComparedReport;
};

const COLUMNS: Array<[keyof Comparison, string]> = [
  ['devBefore', 'Dev (40) antes'],
  ['devAfter', 'Dev (40) después'],
  ['holdoutBefore', 'Holdout antes'],
  ['holdoutAfter', 'Holdout después'],
];

const ratio = (r: Ratio | undefined) =>
  !r
    ? '—'
    : r.rate === null
      ? `${r.numerator}/${r.denominator}`
      : `${r.numerator}/${r.denominator} (${(r.rate * 100).toFixed(1)}%)`;
const seconds = (ms: number | null | undefined) =>
  ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`;
const usd = (value: number | null | undefined) =>
  value == null ? 'sin datos' : `USD ${value.toFixed(4)}`;

const unsafeRuns = (r: ComparedReport) => {
  const all = Object.values(r.metrics.unsafe);
  return all.reduce((sum, u) => sum + u.numerator, 0);
};

export function compareToMarkdown(reports: Comparison): string {
  const rows: Array<[string, (r: ComparedReport) => string]> = [
    ['Corridas que pasan', (r) => ratio(r.metrics.verdicts)],
    [
      'Resolución automática segura',
      (r) => ratio(r.metrics.safeAutoResolution.safe),
    ],
    ['Containment', (r) => ratio(r.metrics.containment)],
    ['Transferencias correctas', (r) => ratio(r.metrics.escalation.correct)],
    ['Transferencias faltantes', (r) => ratio(r.metrics.escalation.missing)],
    ['Transferencias sobrantes', (r) => ratio(r.metrics.escalation.extra)],
    ['Hallazgos inseguros', (r) => String(unsafeRuns(r))],
    ['Latencia p50', (r) => seconds(r.metrics.latency.runnerMs.p50)],
    ['Latencia p95', (r) => seconds(r.metrics.latency.runnerMs.p95)],
    ['Costo por caso intentado', (r) => usd(r.metrics.cost.perAttemptedUsd)],
    [
      'Costo por caso resuelto solo',
      (r) => usd(r.metrics.cost.perSafeResolvedUsd),
    ],
    [
      'Mismo veredicto en todas las corridas',
      (r) => ratio(r.metrics.variability.consistentCases),
    ],
    ['Pasa en español', (r) => ratio(r.metrics.byLanguage.es?.pasa)],
    ['Pasa en portugués', (r) => ratio(r.metrics.byLanguage.pt?.pasa)],
    [
      'Muestra',
      (r) =>
        `${r.meta.sample.cases} casos × ${r.meta.sample.runsPerCase} corridas`,
    ],
    ['Prompt', (r) => r.meta.promptVersion ?? 'sin datos'],
    ['Commit del back', (r) => r.meta.commit.slice(0, 8)],
  ];

  const cell = (key: keyof Comparison, row: (r: ComparedReport) => string) => {
    const report = reports[key];
    return report ? row(report) : '—';
  };

  return [
    '# Evaluación de David: antes y después',
    '',
    '> Medición offline, en local. El set dev son los 40 casos de §7, con los que se corrigió al agente: su "después" puede estar sobreajustado. El holdout se escribió aparte y el equipo del agente no lo vio: su "después" es la medición sin leakage.',
    '',
    `| Métrica | ${COLUMNS.map(([, title]) => title).join(' | ')} |`,
    `| --- | ${COLUMNS.map(() => '---').join(' | ')} |`,
    ...rows.map(
      ([name, row]) =>
        `| ${name} | ${COLUMNS.map(([key]) => cell(key, row)).join(' | ')} |`,
    ),
    '',
  ].join('\n');
}

function parseArgs(argv: string[]) {
  const flags: Record<string, keyof Comparison> = {
    '--dev-before': 'devBefore',
    '--dev-after': 'devAfter',
    '--holdout-before': 'holdoutBefore',
    '--holdout-after': 'holdoutAfter',
  };
  const paths: Partial<Record<keyof Comparison, string>> = {};
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--out') out = argv[++i];
    else if (flag in flags) paths[flags[flag]] = argv[++i];
    else throw new Error(`Unknown flag: ${flag}`);
  }
  return { paths, out };
}

function main(argv: string[]) {
  const { paths, out } = parseArgs(argv);
  const reports: Comparison = {};
  for (const [key, path] of Object.entries(paths)) {
    reports[key as keyof Comparison] = JSON.parse(readFileSync(path, 'utf8'));
  }
  const markdown = compareToMarkdown(reports);
  if (out) writeFileSync(out, markdown);
  console.log(markdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
