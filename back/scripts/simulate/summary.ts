import { estimateCostUsd } from '../../server/src/pricing';
import { percentile } from '../eval/score';
import type { Language, Motive } from './conversations';

// The run record and its summary. No import.meta.

export type TurnRecord = {
  step: number;
  runnerMs: number;
  backMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  handoffReason: string | null;
};

export type ConversationRecord = {
  customerId: string;
  motive: Motive;
  language: Language;
  chatId: string;
  token: string;
  handoffReason: string | null;
  handledBy: string | null;
  closed: boolean;
  error?: string;
  turns: TurnRecord[];
};

export type Summary = {
  conversations: number;
  perMotive: Record<string, number>;
  // Every handoff stays waiting in the queue.
  handedOff: number;
  resolvedByAi: number;
  runnerMs: { p50: number | null; p95: number | null };
  backMs: { p50: number | null; p95: number | null };
  estimatedCostUsd: number | null;
  pt: number;
  errors: number;
};

export function summarize(records: ConversationRecord[]): Summary {
  const turns = records.flatMap((r) => r.turns);
  const backs = turns
    .map((t) => t.backMs)
    .filter((v): v is number => v !== null);
  const cost = turns.reduce<number | null>((sum, t) => {
    const c = estimateCostUsd({
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      durationMs: t.backMs ?? 0,
    });
    return c === null ? sum : (sum ?? 0) + c;
  }, null);
  const handed = records.filter((r) => r.handoffReason);
  const perMotive: Record<string, number> = {};
  for (const r of records) perMotive[r.motive] = (perMotive[r.motive] ?? 0) + 1;
  return {
    conversations: records.length,
    perMotive,
    handedOff: handed.length,
    resolvedByAi: records.filter((r) => r.closed && !r.handoffReason).length,
    runnerMs: {
      p50: percentile(
        turns.map((t) => t.runnerMs),
        0.5,
      ),
      p95: percentile(
        turns.map((t) => t.runnerMs),
        0.95,
      ),
    },
    backMs: { p50: percentile(backs, 0.5), p95: percentile(backs, 0.95) },
    estimatedCostUsd: cost,
    pt: records.filter((r) => r.language === 'pt').length,
    errors: records.filter((r) => r.error).length,
  };
}

// Upper bound before running: ~4 turns per conversation at typical tokens.
export function estimateCostUpperBound(count: number): number {
  const perTurn =
    estimateCostUsd({
      inputTokens: 20_000,
      outputTokens: 1_000,
      durationMs: 0,
    }) ?? 0;
  return count * 4 * perTurn;
}
