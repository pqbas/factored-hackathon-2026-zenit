/**
 * Evaluation runner: the cases of scripts/eval/cases/ (docs/flujo-atencion.md
 * §7) against the real back and agent, N times each, and a report with the
 * hackathon's metrics in scripts/eval/results/.
 *
 *   npm run eval                                  # 40 cases x 3 runs
 *   npm run eval -- --case 01,11,37 --runs 1
 *   npm run eval -- --base http://localhost:3300 --classifier llm
 *
 * Local only: it refuses any --base that isn't localhost or 127.0.0.1. Needs
 * the eval back (scripts/eval/start-eval-back.sh) and the agent on :8001.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headersFor, sendMessage } from '../simulate-customers';
import { assertLocalBase } from './guard';
import {
  buildReport,
  toMarkdown,
  type RunResult,
  type TurnRecord,
} from './report';
import { isSilence, observedOutcome, verdict } from './score';
import {
  caseChangesSchema,
  evalCaseSchema,
  type EvalCase,
  type Handoff,
  type Observed,
  type StepReply,
  type TranscriptMessage,
} from './types';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = 'http://localhost:3300';

const ADMIN = {
  'X-Forwarded-User': 'eval-admin',
  'X-Forwarded-Email': process.env.EVAL_ADMIN_EMAIL ?? 'pcubasm1@gmail.com',
};
const advisor = (name: 'asesor1' | 'asesor2') => ({
  'X-Forwarded-User': name,
  'X-Forwarded-Email': `${name}@example.com`,
});

export type Args = {
  cases: string[] | null;
  runs: number;
  base: string;
  classifier: string;
  out: string;
  delay: number;
};

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    cases: null,
    runs: 3,
    base: DEFAULT_BASE,
    classifier: 'llm',
    out: join(HERE, 'results'),
    delay: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i];
    if (flag === '--case')
      args.cases = value()
        .split(',')
        .map((c) => c.trim().toUpperCase());
    else if (flag === '--runs') args.runs = Number(value());
    else if (flag === '--base') args.base = value();
    else if (flag === '--classifier') args.classifier = value();
    else if (flag === '--out') args.out = value();
    else if (flag === '--delay') args.delay = Number(value());
    else throw new Error(`Unknown flag: ${flag}`);
  }
  if (!Number.isInteger(args.runs) || args.runs < 1) {
    throw new Error('--runs must be a positive integer');
  }
  // Before anything else: nothing is sent to a base that isn't local.
  assertLocalBase(args.base);
  return args;
}

export function loadCases(only: string[] | null = null): EvalCase[] {
  const dir = join(HERE, 'cases');
  const cases = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) =>
      evalCaseSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8'))),
    );
  if (!only) return cases;
  const missing = only.filter(
    (id) => !cases.some((c) => c.id === id.padStart(2, '0')),
  );
  if (missing.length) throw new Error(`No case ${missing.join(', ')}`);
  return cases.filter((c) => only.some((id) => id.padStart(2, '0') === c.id));
}

async function api<T>(
  base: string,
  path: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetch(`${base}${path}`, { headers });
  if (!response.ok) {
    throw new Error(
      `GET ${path} -> HTTP ${response.status} ${(await response.text()).slice(0, 200)} (is ${ADMIN['X-Forwarded-Email']} in ADMIN_EMAILS of the back?)`,
    );
  }
  return (await response.json()) as T;
}

async function advisorPost(
  base: string,
  headers: Record<string, string>,
  path: string,
  data: unknown,
) {
  const response = await fetch(`${base}/api/advisor/conversations/${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(
      `POST ${path} -> HTTP ${response.status} ${(await response.text()).slice(0, 200)}`,
    );
  }
}

type ApiMessage = {
  role: string;
  senderType: string | null;
  parts: Array<{ type: string; text?: string }>;
  createdAt: string;
};

function toTranscript(messages: ApiMessage[]): TranscriptMessage[] {
  return messages.map((m) => {
    const role =
      m.role === 'user'
        ? 'customer'
        : m.senderType === 'human_agent'
          ? 'advisor'
          : m.senderType === 'system' || m.role === 'system'
            ? 'system'
            : 'david';
    return {
      role,
      text: m.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text ?? '')
        .join(''),
      createdAt: m.createdAt,
    };
  });
}

type ApiTurn = {
  messageId: string | null;
  source: string;
  durationMs: number;
  intent: string | null;
  useCase: string | null;
  language: string | null;
  blocked: boolean;
  handoffReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
  promptVersion: string | null;
  classifier: string | null;
  guardFired: boolean | null;
  guardMissingTool: string | null;
  guardAction: string | null;
};

// One run of a case, in a new chat as the customer's local user.
export async function runCase(
  base: string,
  evalCase: EvalCase,
  run: number,
  delay = 0,
): Promise<RunResult> {
  const chatId = randomUUID();
  const headers = headersFor('local', evalCase.customer.user);
  const stepReplies: StepReply[] = [];
  const sent: Array<{
    step: number;
    messageId: string;
    runnerMs: number;
    events: string[];
  }> = [];
  let holder: 'asesor1' | 'asesor2' = 'asesor1';

  for (const [step, action] of evalCase.steps.entries()) {
    if ('say' in action) {
      const result = await sendMessage(
        base,
        headers,
        chatId,
        action.say,
        evalCase.customer.token,
      );
      stepReplies.push({ step, say: action.say, reply: result.reply });
      sent.push({
        step,
        messageId: result.messageId,
        runnerMs: result.durationMs,
        events: result.events,
      });
      if (delay) await new Promise((r) => setTimeout(r, delay));
    } else if ('take' in action) {
      holder = action.take;
      await advisorPost(base, advisor(holder), `${chatId}/take`, {});
    } else {
      await advisorPost(base, advisor(holder), `${chatId}/release`, {
        outcome: action.release,
      });
    }
  }

  const chat = await api<{ closedAt: string | null; handoff: Handoff | null }>(
    base,
    `/api/advisor/conversations/${chatId}`,
    ADMIN,
  );
  const messages = await api<ApiMessage[]>(
    base,
    `/api/advisor/conversations/${chatId}/messages`,
    ADMIN,
  );
  const { turns: rows } = await api<{ turns: ApiTurn[] }>(
    base,
    `/api/advisor/conversations/${chatId}/turns`,
    ADMIN,
  );

  const observed: Observed = {
    transcript: toTranscript(messages),
    stepReplies,
    handoff: chat.handoff,
    resolved: Boolean(chat.closedAt),
  };
  const scored = verdict(evalCase, observed);
  const lastReply =
    observed.transcript.filter((m) => m.role === 'david').at(-1)?.text ?? '';

  const turns: TurnRecord[] = sent
    .filter(
      (s) =>
        !isSilence(stepReplies.find((r) => r.step === s.step)?.reply ?? ''),
    )
    .map((s) => {
      const row = rows.find((r) => r.messageId === s.messageId);
      return {
        step: s.step,
        runnerMs: s.runnerMs,
        backMs: row?.durationMs ?? null,
        source: row?.source ?? null,
        intent: row?.intent ?? null,
        useCase: row?.useCase ?? null,
        language: row?.language ?? null,
        blocked: row?.blocked ?? null,
        handoffReason: row?.handoffReason ?? null,
        inputTokens: row?.inputTokens ?? null,
        outputTokens: row?.outputTokens ?? null,
        model: row?.model ?? null,
        promptVersion: row?.promptVersion ?? null,
        classifier: row?.classifier ?? null,
        guardFired: row?.guardFired ?? null,
        guardMissingTool: row?.guardMissingTool ?? null,
        guardAction: row?.guardAction ?? null,
      };
    });
  const firstSay = sent[0];
  const firstRow = rows.find((r) => r.messageId === firstSay?.messageId);
  const facts = evalCase.expected.handoffFacts ?? [];

  return {
    caseId: evalCase.id,
    run,
    group: evalCase.group,
    language: evalCase.language,
    segment: evalCase.customer.segment,
    limitation: evalCase.limitation === true,
    knownFailure: evalCase.knownFailure ?? null,
    firstMessage: stepReplies[0]?.say ?? '',
    expectedOutcome: evalCase.expected.outcome,
    expectedReason: evalCase.expected.reason ?? null,
    expectedFirstIntent: evalCase.expected.firstIntent,
    hasForbidden: (evalCase.expected.forbidden ?? []).length > 0,
    handoffFactsExpected: facts,
    observedOutcome: observedOutcome({ handoff: observed.handoff, lastReply }),
    observedFirstIntent: firstRow?.intent ?? null,
    handoffReason: observed.handoff?.reason ?? null,
    handoffFactsComplete: observed.handoff
      ? facts.every((k) => {
          const v = observed.handoff?.verifiedData?.[k];
          return v !== undefined && v !== null;
        })
      : null,
    hadHuman:
      observed.handoff !== null || evalCase.steps.some((s) => 'take' in s),
    verdict: scored.verdict,
    reasons: scored.reasons,
    unsafe: scored.unsafe,
    turns,
    transcript: observed.transcript.map((m) => ({
      role: m.role,
      text: m.text,
    })),
  };
}

function commit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      cwd: HERE,
    }).trim();
  } catch {
    return 'unknown';
  }
}

export async function main(argv: string[]) {
  const args = parseArgs(argv);
  const cases = loadCases(args.cases);
  console.log(
    `Base: ${args.base} · ${cases.length} cases x ${args.runs} runs · classifier ${args.classifier}`,
  );

  const results: RunResult[] = [];
  let checked = false;
  for (let run = 1; run <= args.runs; run++) {
    for (const evalCase of cases) {
      let result: RunResult;
      try {
        result = await runCase(args.base, evalCase, run, args.delay);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!checked) throw error;
        console.warn(`  #${evalCase.id} run ${run}: runner error: ${message}`);
        result = {
          caseId: evalCase.id,
          run,
          group: evalCase.group,
          language: evalCase.language,
          segment: evalCase.customer.segment,
          limitation: evalCase.limitation === true,
          knownFailure: evalCase.knownFailure ?? null,
          firstMessage: '',
          expectedOutcome: evalCase.expected.outcome,
          expectedReason: evalCase.expected.reason ?? null,
          expectedFirstIntent: evalCase.expected.firstIntent,
          hasForbidden: (evalCase.expected.forbidden ?? []).length > 0,
          handoffFactsExpected: evalCase.expected.handoffFacts ?? [],
          observedOutcome: 'answered',
          observedFirstIntent: null,
          handoffReason: null,
          handoffFactsComplete: null,
          hadHuman: false,
          verdict: 'falla',
          reasons: [`runner_error: ${message}`],
          unsafe: [],
          turns: [],
          transcript: [],
        };
      }
      results.push(result);
      console.log(
        `  #${evalCase.id} run ${run}: ${result.verdict}${result.reasons.length ? ` (${result.reasons.join('; ')})` : ''}`,
      );

      if (!checked) {
        checked = true;
        const reported = result.turns.map((t) => t.classifier).find((c) => c);
        if (reported && reported !== args.classifier) {
          throw new Error(
            `The agent reports classifier ${reported} but --classifier is ${args.classifier}: restart the agent with CLASSIFIER=${args.classifier}.`,
          );
        }
        if (!reported) {
          console.warn(
            '  The turns report no classifier (the agent does not send it yet): not checked.',
          );
        }
      }
    }
  }

  const turns = results.flatMap((r) => r.turns);
  const first = (pick: (t: RunResult['turns'][number]) => string | null) =>
    turns.map(pick).find((v) => v) ?? null;
  const report = buildReport(results, {
    date: new Date().toISOString().slice(0, 10),
    commit: commit(),
    base: args.base,
    runsPerCase: args.runs,
    classifierRequested: args.classifier,
    classifier: first((t) => t.classifier),
    model: first((t) => t.model),
    promptVersion: first((t) => t.promptVersion),
    caseChanges: caseChangesSchema.parse(
      JSON.parse(readFileSync(join(HERE, 'case-changes.json'), 'utf8')),
    ),
  });

  mkdirSync(args.out, { recursive: true });
  const stem = join(args.out, `${report.meta.date}-${args.classifier}`);
  writeFileSync(`${stem}.json`, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${stem}.md`, toMarkdown(report));
  console.log(`\nReport: ${stem}.json and ${stem}.md`);
  return report;
}

// Only when run as a script: the tests import the functions above.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
