// The comparison table of compare.ts, apart so the tests can load it (the
// Playwright loader can't import a module that uses import.meta).
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
    // Absent in reports from before the grounding guard.
    guard?: { fired: Ratio; retriedOk: Ratio; safeReply: Ratio };
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
    [
      'Guard de grounding: disparos',
      (r) => (r.metrics.guard ? ratio(r.metrics.guard.fired) : 'sin datos'),
    ],
    [
      'Guard: reintentos respaldados',
      (r) => (r.metrics.guard ? ratio(r.metrics.guard.retriedOk) : 'sin datos'),
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
