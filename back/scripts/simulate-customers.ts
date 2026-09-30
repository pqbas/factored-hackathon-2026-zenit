/**
 * Simulated customers: scripted conversations against the real API, to try
 * the app with frequent cases and fill the advisor console.
 *
 *   npm run simulate -- --all [--target local|prod] [--repeat N] [--delay ms]
 *   npm run simulate -- --scenario 01-saldo-tarjeta
 *
 * Each scenario is a JSON file in scripts/scenarios/ (docs/flujo-atencion.md).
 * Local: each bot is its own user (clienteN@example.com via X-Forwarded-*).
 * Prod: every chat belongs to whoever runs the script (OAuth token from
 * `databricks auth token -p DEFAULT`); the bank customer still varies by
 * sessionToken. Prod costs LLM and warehouse time: run it only when agreed.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGETS = {
  local: 'http://localhost:3200',
  prod: 'https://dev-bank-assistant-ui-7474647867986650.aws.databricksapps.com',
} as const;

export type Scenario = {
  name: string;
  description: string;
  sessionToken: string;
  customer: number;
  messages: string[];
};

export type ChatState = {
  handledBy?: string;
  useCase?: string | null;
  intent?: string | null;
  closedAt?: string | null;
};

function parseArgs(argv: string[]) {
  const args = {
    target: 'local' as keyof typeof TARGETS,
    scenario: undefined as string | undefined,
    all: false,
    repeat: 1,
    delay: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i];
    if (flag === '--target') args.target = value() as keyof typeof TARGETS;
    else if (flag === '--scenario') args.scenario = value();
    else if (flag === '--all') args.all = true;
    else if (flag === '--repeat') args.repeat = Number(value());
    else if (flag === '--delay') args.delay = Number(value());
    else throw new Error(`Unknown flag: ${flag}`);
  }
  if (!(args.target in TARGETS)) {
    throw new Error('--target must be local or prod');
  }
  if (!args.all && !args.scenario) {
    throw new Error('Pass --scenario <name> or --all');
  }
  return args;
}

function loadScenarios(only?: string): Scenario[] {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'scenarios');
  const scenarios = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map(
      (file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Scenario,
    );
  if (!only) return scenarios;
  const match = scenarios.filter((s) => s.name === only);
  if (match.length === 0) throw new Error(`No scenario named ${only}`);
  return match;
}

function prodToken(): string {
  const out = execFileSync(
    'databricks',
    ['auth', 'token', '-p', 'DEFAULT', '-o', 'json'],
    { encoding: 'utf8' },
  );
  return (JSON.parse(out) as { access_token: string }).access_token;
}

export function headersFor(
  target: keyof typeof TARGETS,
  customer: number,
  token?: string,
): Record<string, string> {
  if (target === 'prod') return { Authorization: `Bearer ${token}` };
  const user = `cliente${customer}`;
  return {
    'X-Forwarded-User': user,
    'X-Forwarded-Email': `${user}@example.com`,
    'X-Forwarded-Preferred-Username': user,
  };
}

// Reads the UI message stream (SSE) to the end: the text deltas joined and the
// type of every part (data-agent-pending, error, ...).
async function readStream(
  response: Response,
): Promise<{ reply: string; events: string[] }> {
  const body = await response.text();
  let text = '';
  const errors: string[] = [];
  const events: string[] = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const event = JSON.parse(line.slice(6)) as {
        type: string;
        delta?: string;
        errorText?: string;
        data?: unknown;
      };
      events.push(event.type);
      if (event.type === 'text-delta' && event.delta) text += event.delta;
      if (event.type === 'error') errors.push(event.errorText ?? 'error');
      if (event.type === 'data-error') errors.push(String(event.data));
    } catch {
      // Not JSON: ignore.
    }
  }
  if (!text && errors.length) {
    return { reply: `[error] ${errors.join('; ')}`, events };
  }
  return { reply: text.trim() || '[sin respuesta]', events };
}

export function statusOf(chat: ChatState | null): string {
  if (!chat) return '?';
  if (chat.closedAt) return 'Resuelta';
  if (chat.handledBy === 'human_queue') return 'En espera';
  if (chat.handledBy === 'human_agent') return 'Con asesor';
  return 'Con AI';
}

// One customer message through POST /api/chat, read to the end of the stream.
// durationMs runs from the POST to the last byte; events are the types of the
// stream's parts (data-agent-pending shows the agent was down). messageId is
// the customer message's id, which TurnMetric.messageId points to.
export async function sendMessage(
  base: string,
  headers: Record<string, string>,
  chatId: string,
  text: string,
  sessionToken: string,
): Promise<{
  reply: string;
  durationMs: number;
  events: string[];
  messageId: string;
}> {
  const messageId = randomUUID();
  const started = performance.now();
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: chatId,
      message: {
        id: messageId,
        role: 'user',
        parts: [{ type: 'text', text }],
      },
      selectedChatModel: 'chat-model',
      selectedVisibilityType: 'private',
      sessionToken,
    }),
  });
  if (!response.ok) {
    const reply = `[HTTP ${response.status}] ${(await response.text()).slice(0, 200)}`;
    return {
      reply,
      durationMs: performance.now() - started,
      events: [],
      messageId,
    };
  }
  const { reply, events } = await readStream(response);
  return { reply, durationMs: performance.now() - started, events, messageId };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runScenario(
  base: string,
  headers: Record<string, string>,
  scenario: Scenario,
  delay: number,
  chatId: string = randomUUID(),
) {
  console.log(`\n=== ${scenario.name}: ${scenario.description}`);
  console.log(`    chat ${chatId} · sessionToken ${scenario.sessionToken}`);

  for (const text of scenario.messages) {
    const { reply } = await sendMessage(
      base,
      headers,
      chatId,
      text,
      scenario.sessionToken,
    );
    console.log(`  Cliente: ${text}`);
    console.log(`  David:   ${reply.replace(/\n+/g, '\n           ')}`);
    if (delay) await sleep(delay);
  }

  const chatResponse = await fetch(`${base}/api/chat/${chatId}`, { headers });
  const chat = chatResponse.ok
    ? ((await chatResponse.json()) as ChatState)
    : null;
  return {
    scenario: scenario.name,
    chatId,
    handledBy: chat?.handledBy ?? null,
    intent: chat?.intent ?? null,
    useCase: chat?.useCase ?? null,
    status: statusOf(chat),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenarios = loadScenarios(args.all ? undefined : args.scenario);
  const base = TARGETS[args.target];
  const token = args.target === 'prod' ? prodToken() : undefined;
  console.log(`Target: ${args.target} (${base})`);

  const results = [];
  for (let round = 0; round < args.repeat; round++) {
    for (const scenario of scenarios) {
      results.push(
        await runScenario(
          base,
          headersFor(args.target, scenario.customer, token),
          scenario,
          args.delay,
        ),
      );
    }
  }

  console.log('\n=== Resumen');
  console.table(results);
}

// Only when run as a script: seed-console.ts imports the helpers above.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
