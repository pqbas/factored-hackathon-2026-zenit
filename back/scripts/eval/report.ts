import { PRICING_ASSUMPTIONS, estimateCostUsd } from '../../server/src/pricing';
import { keywordIntent } from './baseline';
import {
  UNSAFE_TYPES,
  percentile,
  type UnsafeFinding,
  type UnsafeType,
  HANDOFF_NEEDS_CONFIRMATION,
} from './score';
import type { CaseChanges, EvalCase, Outcome } from './types';

// One turn of a run: what the runner measured and what the back stored in
// TurnMetric for the same customer message (null when the agent's reply was
// discarded or the metric is missing).
export type TurnRecord = {
  step: number;
  runnerMs: number;
  backMs: number | null;
  source: string | null;
  intent: string | null;
  useCase: string | null;
  language: string | null;
  blocked: boolean | null;
  handoffReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
  promptVersion: string | null;
  classifier: string | null;
  // The grounding guard: null when the agent didn't report it.
  guardFired: boolean | null;
  guardMissingTool: string | null;
  guardAction: string | null;
};

export type RunResult = {
  caseId: string;
  run: number;
  group: string;
  language: EvalCase['language'];
  segment: EvalCase['customer']['segment'];
  limitation: boolean;
  knownFailure: string | null;
  firstMessage: string;
  expectedOutcome: Outcome;
  expectedReason: string | null;
  expectedFirstIntent: string | null;
  hasForbidden: boolean;
  handoffFactsExpected: string[];
  // D, F or answered (R and A).
  observedOutcome: 'D' | 'F' | 'answered';
  observedFirstIntent: string | null;
  handoffReason: string | null;
  // Every key the case asks of the handoff's facts is there.
  handoffFactsComplete: boolean | null;
  hadHuman: boolean;
  verdict: 'pasa' | 'falla';
  reasons: string[];
  unsafe: UnsafeFinding[];
  turns: TurnRecord[];
  transcript: Array<{ role: string; text: string }>;
};

export type ReportMeta = {
  date: string;
  commit: string;
  base: string;
  runsPerCase: number;
  // Asked with --classifier and the one the turns reported.
  classifierRequested: string;
  classifier: string | null;
  model: string | null;
  promptVersion: string | null;
  set: 'dev' | 'holdout';
  label: string | null;
  caseChanges: CaseChanges;
};

type Ratio = { numerator: number; denominator: number; rate: number | null };

const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});

function costOf(run: RunResult): number | null {
  if (run.turns.length === 0) return null;
  let input = 0;
  let output = 0;
  for (const turn of run.turns) {
    if (turn.inputTokens === null || turn.outputTokens === null) return null;
    input += turn.inputTokens;
    output += turn.outputTokens;
  }
  return estimateCostUsd({
    inputTokens: input,
    outputTokens: output,
    durationMs: run.turns.reduce((sum, t) => sum + t.runnerMs, 0),
  });
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function breakdown(runs: RunResult[], key: (r: RunResult) => string) {
  const groups: Record<
    string,
    { runs: number; pasa: Ratio; unsafeRuns: Ratio }
  > = {};
  for (const name of new Set(runs.map(key))) {
    const inGroup = runs.filter((r) => key(r) === name);
    groups[name] = {
      runs: inGroup.length,
      pasa: ratio(
        inGroup.filter((r) => r.verdict === 'pasa').length,
        inGroup.length,
      ),
      unsafeRuns: ratio(
        inGroup.filter((r) => r.unsafe.length > 0).length,
        inGroup.length,
      ),
    };
  }
  return groups;
}

// Grounding guard: fired over the turns where the agent reported it, and what
// came out of the firings.
function guardMetrics(turns: TurnRecord[]) {
  const reported = turns.filter((t) => t.guardFired !== null);
  const fired = reported.filter((t) => t.guardFired);
  const byMissingTool: Record<string, number> = {};
  for (const t of fired) {
    const tool = t.guardMissingTool ?? 'desconocida';
    byMissingTool[tool] = (byMissingTool[tool] ?? 0) + 1;
  }
  return {
    fired: ratio(fired.length, reported.length),
    retriedOk: ratio(
      fired.filter((t) => t.guardAction === 'retried_ok').length,
      fired.length,
    ),
    safeReply: ratio(
      fired.filter((t) => t.guardAction === 'safe_reply').length,
      fired.length,
    ),
    byMissingTool,
  };
}

export function buildReport(all: RunResult[], meta: ReportMeta) {
  const runs = all.filter((r) => !r.limitation);
  const limitations = all.filter((r) => r.limitation);
  const caseIds = [...new Set(runs.map((r) => r.caseId))].sort();
  const withHandoff = runs.filter((r) => r.observedOutcome === 'D');
  const expectedD = runs.filter((r) => r.expectedOutcome === 'D');

  const safeAuto = runs.filter((r) => r.verdict === 'pasa' && !r.hadHuman);
  const attempted = runs.filter((r) => r.observedOutcome === 'answered');

  const unsafeDenominators: Record<UnsafeType, RunResult[]> = {
    other_customer_data: runs.filter((r) => r.hasForbidden),
    claimed_action: runs,
    handoff_without_confirmation: runs.filter(
      (r) =>
        r.handoffReason !== null && HANDOFF_NEEDS_CONFIRMATION(r.handoffReason),
    ),
    spoke_after_handoff: runs.filter((r) => r.handoffReason !== null),
  };
  const unsafe = Object.fromEntries(
    UNSAFE_TYPES.map((type) => [
      type,
      ratio(
        runs.filter((r) => r.unsafe.some((f) => f.type === type)).length,
        unsafeDenominators[type].length,
      ),
    ]),
  ) as Record<UnsafeType, Ratio>;

  const turns = runs.flatMap((r) => r.turns);
  const runnerMs = turns.map((t) => t.runnerMs);
  const backMs = turns
    .filter((t) => t.source === 'live' && t.backMs !== null)
    .map((t) => t.backMs as number);

  const costs = runs.map((r) => ({ run: r, usd: costOf(r) }));
  const withCost = costs.filter((c) => c.usd !== null) as Array<{
    run: RunResult;
    usd: number;
  }>;
  const attemptedWithCost = withCost.filter(
    (c) => c.run.observedOutcome === 'answered',
  );
  const safeWithCost = withCost.filter(
    (c) => c.run.verdict === 'pasa' && !c.run.hadHuman,
  );
  const totalUsd = sum(withCost.map((c) => c.usd));

  const perCase = caseIds.map((id) => {
    const of = runs
      .filter((r) => r.caseId === id)
      .sort((a, b) => a.run - b.run);
    return {
      id,
      group: of[0].group,
      language: of[0].language,
      segment: of[0].segment,
      knownFailure: of[0].knownFailure,
      expectedOutcome: of[0].expectedOutcome,
      verdicts: of.map((r) => r.verdict),
      consistent: new Set(of.map((r) => r.verdict)).size === 1,
    };
  });
  const runIndexes = [...new Set(runs.map((r) => r.run))].sort((a, b) => a - b);

  const intentCases = runs.filter((r) => r.expectedFirstIntent !== null);
  const baselineCases = perCaseFirst(intentCases);

  return {
    meta: {
      ...meta,
      note: 'Medición offline, en local.',
      costAssumptions: PRICING_ASSUMPTIONS,
      sample: {
        cases: caseIds.length,
        runsPerCase: meta.runsPerCase,
        runs: runs.length,
        limitationRuns: limitations.length,
      },
    },
    metrics: {
      safeAutoResolution: {
        safe: ratio(safeAuto.length, runs.length),
        attempted: ratio(attempted.length, runs.length),
      },
      containment: ratio(
        runs.filter((r) => r.handoffReason === null).length,
        runs.length,
      ),
      escalation: {
        correct: ratio(
          expectedD.filter(
            (r) =>
              r.observedOutcome === 'D' && r.handoffReason === r.expectedReason,
          ).length,
          expectedD.length,
        ),
        missing: ratio(
          expectedD.filter((r) => r.observedOutcome !== 'D').length,
          expectedD.length,
        ),
        extra: ratio(
          withHandoff.filter((r) => r.expectedOutcome !== 'D').length,
          runs.filter((r) => r.expectedOutcome !== 'D').length,
        ),
        completeFacts: ratio(
          expectedD.filter(
            (r) => r.observedOutcome === 'D' && r.handoffFactsComplete === true,
          ).length,
          expectedD.filter((r) => r.observedOutcome === 'D').length,
        ),
      },
      unsafe,
      latency: {
        runnerMs: {
          p50: percentile(runnerMs, 0.5),
          p95: percentile(runnerMs, 0.95),
          turns: runnerMs.length,
        },
        backLiveMs: {
          p50: percentile(backMs, 0.5),
          p95: percentile(backMs, 0.95),
          turns: backMs.length,
        },
      },
      cost: {
        runsWithUsage: ratio(withCost.length, runs.length),
        totalUsd: withCost.length ? totalUsd : null,
        perAttemptedUsd: attemptedWithCost.length
          ? sum(attemptedWithCost.map((c) => c.usd)) / attemptedWithCost.length
          : null,
        perAttemptedRuns: attemptedWithCost.length,
        perSafeResolvedUsd: safeWithCost.length
          ? totalUsd / safeWithCost.length
          : null,
        perSafeResolvedRuns: safeWithCost.length,
      },
      guard: guardMetrics(turns),
      variability: {
        consistentCases: ratio(
          perCase.filter((c) => c.consistent).length,
          perCase.length,
        ),
        passRateByRun: runIndexes.map((run) => {
          const of = runs.filter((r) => r.run === run);
          return {
            run,
            ...ratio(of.filter((r) => r.verdict === 'pasa').length, of.length),
          };
        }),
      },
      byLanguage: breakdown(runs, (r) => r.language),
      bySegment: breakdown(runs, (r) => r.segment),
      classifierVsBaseline: {
        classifier: ratio(
          intentCases.filter(
            (r) => r.observedFirstIntent === r.expectedFirstIntent,
          ).length,
          intentCases.length,
        ),
        baseline: ratio(
          baselineCases.filter(
            (r) => keywordIntent(r.firstMessage) === r.expectedFirstIntent,
          ).length,
          baselineCases.length,
        ),
      },
      verdicts: ratio(
        runs.filter((r) => r.verdict === 'pasa').length,
        runs.length,
      ),
    },
    cases: perCase,
    limitations: limitations.map((r) => ({
      id: r.caseId,
      run: r.run,
      verdict: r.verdict,
      reasons: r.reasons,
      reply:
        r.transcript.filter((m) => m.role === 'david').at(-1)?.text ?? null,
    })),
    runs: all,
  };
}

// The baseline is deterministic: one entry per case.
function perCaseFirst(runs: RunResult[]) {
  const seen = new Set<string>();
  return runs.filter((r) => {
    if (seen.has(r.caseId)) return false;
    seen.add(r.caseId);
    return true;
  });
}

export type Report = ReturnType<typeof buildReport>;

const pct = (r: Ratio) =>
  r.rate === null ? 'sin datos' : `${(r.rate * 100).toFixed(1)}%`;
const frac = (r: Ratio) => `${r.numerator}/${r.denominator} (${pct(r)})`;
const ms = (v: number | null) =>
  v === null ? 'sin datos' : `${Math.round(v)} ms`;
const usd = (v: number | null) =>
  v === null ? 'sin datos' : `USD ${v.toFixed(5)}`;

export function toMarkdown(report: Report): string {
  const { meta, metrics: m } = report;
  const lines: string[] = [];
  const add = (...l: string[]) => lines.push(...l);

  add(
    `# Evaluación de David (${meta.date}, set ${meta.set}${meta.label ? ` · ${meta.label}` : ''}, clasificador ${meta.classifier ?? meta.classifierRequested})`,
    '',
    `> ${meta.note}`,
    '',
    '## Muestra',
    '',
    `- Casos: ${meta.sample.cases} × ${meta.sample.runsPerCase} corridas = ${meta.sample.runs} corridas (más ${meta.sample.limitationRuns} de idioma, aparte).`,
    `- Modelo: ${meta.model ?? 'sin datos'}. Versión de prompt: ${meta.promptVersion ?? 'sin datos'}. Clasificador: ${meta.classifier ?? 'sin datos'} (pedido: ${meta.classifierRequested}).`,
    `- Commit: ${meta.commit}. Back: ${meta.base}.`,
    '',
    '## Resultados',
    '',
    `- Corridas que pasan: ${frac(m.verdicts)}.`,
    `- Resolución automática segura (pasa y termina sin humano): ${frac(m.safeAutoResolution.safe)}.`,
    `- Corridas en que se intentó automatizar (llegaron al LLM, sin respuesta fija ni derivación): ${frac(m.safeAutoResolution.attempted)}.`,
    `- Containment (terminan sin transferencia): ${frac(m.containment)}.`,
    '',
    '### Calidad del escalamiento',
    '',
    `- Transferencias correctas (se esperaba y con el motivo esperado): ${frac(m.escalation.correct)}.`,
    `- Faltantes (se esperaba y no hubo): ${frac(m.escalation.missing)}.`,
    `- Sobrantes (hubo y no se esperaba): ${frac(m.escalation.extra)}.`,
    `- Resúmenes con la ficha completa: ${frac(m.escalation.completeFacts)}.`,
    '',
    '### Resultados inseguros',
    '',
    ...UNSAFE_TYPES.map((t) => `- ${t}: ${frac(m.unsafe[t])}.`),
    '',
    '### Latencia por turno',
    '',
    `- De punta a punta (runner): p50 ${ms(m.latency.runnerMs.p50)}, p95 ${ms(m.latency.runnerMs.p95)} (${m.latency.runnerMs.turns} turnos).`,
    `- Del back, turnos en vivo: p50 ${ms(m.latency.backLiveMs.p50)}, p95 ${ms(m.latency.backLiveMs.p95)} (${m.latency.backLiveMs.turns} turnos).`,
    '',
    '### Costo',
    '',
    `- Corridas con tokens: ${frac(m.cost.runsWithUsage)}. Sin tokens el costo es "sin datos", no cero.`,
    `- Total: ${usd(m.cost.totalUsd)}.`,
    `- Por caso intentado: ${usd(m.cost.perAttemptedUsd)} (sobre ${m.cost.perAttemptedRuns} corridas con datos).`,
    `- Por caso resuelto automáticamente: ${usd(m.cost.perSafeResolvedUsd)} (costo total sobre ${m.cost.perSafeResolvedRuns} corridas seguras con datos).`,
    `- Supuestos: ${meta.costAssumptions}`,
    '',
    '### Guard de grounding',
    '',
    `- Disparos (turnos donde David mostró datos sin llamar a la herramienta): ${frac(m.guard.fired)} de los turnos que lo reportan.`,
    `- Reintentos que salieron respaldados: ${frac(m.guard.retriedOk)}.`,
    `- Terminaron en respuesta segura: ${frac(m.guard.safeReply)}.`,
    ...Object.entries(m.guard.byMissingTool).map(
      ([tool, n]) => `- Herramienta faltante ${tool}: ${n}.`,
    ),
    '',
    '### Variabilidad',
    '',
    `- Casos con el mismo veredicto en las ${meta.sample.runsPerCase} corridas: ${frac(m.variability.consistentCases)}.`,
    ...m.variability.passRateByRun.map(
      (r) => `- Corrida ${r.run}: pasa ${frac(r)}.`,
    ),
    '',
    '### Por idioma',
    '',
    ...Object.entries(m.byLanguage).map(
      ([k, v]) =>
        `- ${k}: pasa ${frac(v.pasa)}; corridas con hallazgo inseguro ${frac(v.unsafeRuns)}.`,
    ),
    '',
    '### Por segmento',
    '',
    ...Object.entries(m.bySegment).map(
      ([k, v]) =>
        `- ${k}: pasa ${frac(v.pasa)}; corridas con hallazgo inseguro ${frac(v.unsafeRuns)}.`,
    ),
    '',
    '### Clasificador contra el baseline de palabras clave',
    '',
    `- Exactitud de intención del primer mensaje, clasificador (${meta.classifier ?? meta.classifierRequested}): ${frac(m.classifierVsBaseline.classifier)} (sobre corridas).`,
    `- Baseline de palabras clave: ${frac(m.classifierVsBaseline.baseline)} (sobre casos).`,
    '',
    '## Casos',
    '',
    '| Caso | Grupo | Idioma | Segmento | Esperado | Veredictos |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.cases.map(
      (c) =>
        `| ${c.id}${c.knownFailure ? ' (falla conocida)' : ''} | ${c.group} | ${c.language} | ${c.segment} | ${c.expectedOutcome} | ${c.verdicts.join(', ')} |`,
    ),
    '',
  );

  const known = report.cases.filter((c) => c.knownFailure);
  if (known.length) {
    add(
      '### Fallas conocidas',
      '',
      'Cuentan en las métricas de arriba.',
      '',
      ...known.map(
        (c) =>
          `- #${c.id}: ${c.knownFailure}. Veredictos: ${c.verdicts.join(', ')}.`,
      ),
      '',
    );
  }

  const { frozenAt, changes } = meta.caseChanges;
  add(
    '## Cambios a los casos',
    '',
    `Los patrones y resultados esperados quedaron fijos en el commit ${frozenAt}, antes de la primera corrida.`,
    '',
    ...(changes.length
      ? changes.map(
          (c) =>
            `- ${c.date}, #${c.caseId}, \`${c.field}\`${c.afterSeeingResults ? ' (después de ver resultados)' : ''}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}. ${c.why}`,
        )
      : ['- Ninguno.']),
    '',
  );

  add(
    '## Limitaciones',
    '',
    '- El veredicto es determinista (estado del chat, handoff, respuestas fijas y patrones por caso), sin juez LLM: "dice una cifra que la herramienta no devolvió" solo se mide en los casos que lo declaran (#38, #40).',
    '- Los mensajes del cliente van fijos: si David pregunta en otro orden, la conversación se desalinea y cuenta como falla.',
    '- Los 2 casos de idioma no entran en las métricas:',
    '',
    ...(report.limitations.length
      ? report.limitations.map(
          (l) =>
            `  - ${l.id} (corrida ${l.run}): ${l.verdict}. Respuesta: ${JSON.stringify(l.reply)}`,
        )
      : ['  - (no se corrieron)']),
    '',
  );
  return lines.join('\n');
}
