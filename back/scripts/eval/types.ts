import { z } from 'zod';

// One evaluation case: the customer's messages (and the advisor's actions),
// and what David has to do. The verdict is deterministic (score.ts); the
// flow it checks is docs/flujo-atencion.md.

export const OUTCOMES = ['R', 'A', 'D', 'F'] as const;
export type Outcome = (typeof OUTCOMES)[number];

const stepSchema = z.union([
  z.object({ say: z.string().min(1) }).strict(),
  z.object({ take: z.enum(['asesor1', 'asesor2']) }).strict(),
  z.object({ release: z.enum(['returned_to_agent', 'resolved']) }).strict(),
]);
export type Step = z.infer<typeof stepSchema>;

const regexSource = z.string().refine((source) => {
  try {
    new RegExp(source, 'i');
    return true;
  } catch {
    return false;
  }
}, 'not a valid regular expression');

export const evalCaseSchema = z
  .object({
    // "01".."40", "L1", "L2"; the held-out set "H01".."H20".
    id: z.string().regex(/^(\d{2}|L\d|H\d{2})$/),
    language: z.enum(['es', 'pt', 'mixed', 'en']),
    group: z.string().min(1),
    customer: z
      .object({
        // The demo token (DEMO_CUSTOMERS_JSON) and the local user N of
        // clienteN@example.com the bot chats as.
        token: z.string().min(1),
        user: z.number().int().positive(),
        segment: z.enum(['Basic', 'Plus', 'Premium', 'Student']),
        name: z.string().min(1),
      })
      .strict(),
    steps: z.array(stepSchema).min(1),
    expected: z
      .object({
        // R: David resolves it. A: he asks for something or shows the menu,
        // then goes on. D: he hands off with `reason`. F: a fixed reply.
        outcome: z.enum(OUTCOMES),
        reason: z.enum(['complaint', 'retention', 'case_status']).optional(),
        // Other outcomes that also pass (#35: F, or stage 4 asking to confirm).
        accept: z.array(z.enum(OUTCOMES)).optional(),
        // The intent of the first message; null when the agent reports none
        // (expired session). Feeds the baseline comparison.
        firstIntent: z.string().nullable(),
        // Regexes (case-insensitive). mustMatch: all on David's last reply.
        // mustMatchAnywhere: all on the joined replies. mustNotMatch: none on
        // any reply.
        mustMatch: z.array(regexSource).optional(),
        mustMatchAnywhere: z.array(regexSource).optional(),
        mustNotMatch: z.array(regexSource).optional(),
        // None on the customer's stored messages (a masked CVV).
        customerMustNotMatch: z.array(regexSource).optional(),
        // Exact texts that must never appear in David's replies (another
        // customer's name, figures or card).
        forbidden: z.array(z.string().min(1)).optional(),
        // Keys the handoff's facts.verified_data must carry.
        handoffFacts: z.array(z.string().min(1)).optional(),
        // The step index from which David must not answer (#23).
        silentAfter: z.number().int().nonnegative().optional(),
        // The chat must end resolved (the customer said goodbye).
        resolved: z.boolean().optional(),
      })
      .strict(),
    // L1 and L2: reported apart, not in the metrics.
    limitation: z.boolean().optional(),
    // A known failure of the agent, marked in the report and still counted.
    knownFailure: z.string().optional(),
  })
  .strict();

export type EvalCase = z.infer<typeof evalCaseSchema>;

// The handoff as GET /api/advisor/conversations/:id returns it.
export type Handoff = {
  reason: string;
  summary: string | null;
  // verifiedData is facts.verified_data.
  verifiedData: Record<string, unknown> | null;
  facts: Record<string, unknown> | null;
  at: string;
  resolvedAt: string | null;
};

// One message of the conversation as the runner saw it, in order.
export type TranscriptMessage = {
  role: 'customer' | 'david' | 'advisor' | 'system';
  text: string;
  createdAt: string;
};

// What David answered to each `say` step, straight from the stream: an empty
// text is silence (the chat is paused).
export type StepReply = { step: number; say: string; reply: string };

// What the runner observed in one run of a case.
export type Observed = {
  transcript: TranscriptMessage[];
  stepReplies: StepReply[];
  handoff: Handoff | null;
  resolved: boolean;
};

// Every change to a case after its patterns were frozen (the commit that wrote
// them, before any live run): the report lists them so a pattern adjusted
// after seeing results is on the record (case-changes.json).
export const caseChangeSchema = z.object({
  date: z.string(),
  caseId: z.string(),
  field: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  why: z.string().min(1),
  afterSeeingResults: z.boolean(),
});

export const caseChangesSchema = z.object({
  frozenAt: z.string().min(1),
  changes: z.array(caseChangeSchema),
});

export type CaseChanges = z.infer<typeof caseChangesSchema>;
