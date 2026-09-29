/**
 * Fills the local back (:3200, chatbot_dev) with every case the advisor
 * console shows: one bank customer per row of the matrix below. Customers talk
 * to the local agent through the simulator (in series, to stay under the
 * model endpoint's rate limit); advisors take, hand back and resolve through
 * the advisor API. Local only: it refuses any other target.
 *
 *   npm run seed:console                  # the whole matrix
 *   npm run seed:console -- --only pilar  # some customers, comma-separated
 *
 * Needs the demo tokens below in both DEMO_CUSTOMERS_JSON (back) and
 * DEMO_SESSIONS_JSON (agent), and advisors asesor1/asesor2 in ADVISOR_EMAILS.
 * Scenario messages follow docs/flujo-atencion.md; the agent is an LLM, so the
 * final table compares each customer's expected view with what the console
 * reports.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TARGETS,
  headersFor,
  runScenario,
  type Scenario,
} from './simulate-customers';

const BASE = TARGETS.local;
const ADMIN = {
  'X-Forwarded-User': 'seed-admin',
  'X-Forwarded-Email': process.env.SEED_ADMIN_EMAIL ?? 'pcubasm1@gmail.com',
};
const advisor = (name: 'asesor1' | 'asesor2') => ({
  'X-Forwarded-User': name,
  'X-Forwarded-Email': `${name}@example.com`,
});

type Step =
  | { chat: string[] } // a new conversation
  | { more: string[] } // more turns in the last conversation
  | { take: 'asesor1' | 'asesor2' }
  | { release: 'returned_to_agent' | 'resolved' };

type SeedCustomer = {
  name: string;
  token: string;
  customerId: string; // its customerKey in the console
  user: number; // the app user (clienteN@example.com) the bot chats as
  expected: string; // the console view the customer should end up in
  steps: Step[];
};

const scenario = (file: string) =>
  (
    JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'scenarios', file),
        'utf8',
      ),
    ) as Scenario
  ).messages;

const complaint = (card: string, charge: string, why: string) => [
  'tengo un cargo que no reconozco en mi tarjeta',
  `la ${card}`,
  charge,
  'no lo reconozco',
  why,
  'sí, confirmo',
];
const cancel = (card: string, why: string) => [
  'quiero cancelar mi tarjeta de crédito',
  `la ${card}`,
  why,
  'sí, confirmo',
];
const balanceAndBye = [
  '¿cuál es el saldo de mi tarjeta de crédito?',
  'no gracias, eso es todo',
];

const MATRIX: SeedCustomer[] = [
  {
    name: 'daniela',
    token: 'demo-ar-1',
    customerId: 'CLI-714PN0OOE0WX',
    user: 3,
    expected: 'Con AI (3 conversaciones: resuelta IA, asistida, en curso)',
    steps: [
      { chat: balanceAndBye },
      { chat: ['¿cuál es el saldo de mi cuenta de ahorro?'] },
      { take: 'asesor1' },
      { release: 'returned_to_agent' },
      { more: ['no gracias, eso es todo'] },
      { chat: ['quiero ver mis últimos movimientos'] },
    ],
  },
  {
    name: 'santiago',
    token: 'demo-mx-1',
    customerId: 'CLI-FLEUCGTWGAHL',
    user: 1,
    expected: 'En espera · Reclamo (complaint)',
    steps: [{ chat: scenario('04-reclamo-cargo.json') }],
  },
  {
    name: 'javier',
    token: 'demo-co-1',
    customerId: 'CLI-7MPS3ZOPSN4Q',
    user: 2,
    expected: 'En espera · Cancelación (retention)',
    steps: [{ chat: scenario('05-cancelar-tarjeta.json') }],
  },
  {
    name: 'eduardo',
    token: 'demo-mx-2',
    customerId: 'CLI-0IY07CEBUL79',
    user: 4,
    expected: 'En espera · Estado de reclamo (case_status)',
    steps: [{ chat: scenario('06-estado-reclamo.json') }],
  },
  {
    name: 'fernando',
    token: 'demo-mx-3',
    customerId: 'CLI-OAZTV7GG5M0D',
    user: 5,
    expected: 'Con asesor · asesor1 · Reclamo',
    steps: [
      {
        chat: complaint(
          '2327',
          'el de Óptica Visión de 108.46 del 17 de junio',
          'yo no compré nada en esa óptica',
        ),
      },
      { take: 'asesor1' },
    ],
  },
  {
    name: 'gustavo',
    token: 'demo-co-2',
    customerId: 'CLI-TVX8Q10GJDTW',
    user: 6,
    expected:
      'Con asesor · asesor2 · Cancelación (también visible para asesor1)',
    steps: [
      { chat: cancel('0126', 'porque ya casi no la uso') },
      { take: 'asesor2' },
    ],
  },
  {
    name: 'adriana',
    token: 'demo-ar-2',
    customerId: 'CLI-2MM9EXMOO8KD',
    user: 7,
    expected: 'Resueltas (IA de punta a punta)',
    steps: [{ chat: ['hola', ...balanceAndBye] }],
  },
  {
    name: 'victoria',
    token: 'demo-mx-4',
    customerId: 'CLI-01OSDSMM4FX2',
    user: 8,
    expected: 'Resueltas (por humano: derivó, asesor1 tomó y resolvió)',
    steps: [
      {
        chat: complaint(
          '1670',
          'el de Laboratorio Central de 380.60 del 17 de mayo',
          'nunca fui a ese laboratorio',
        ),
      },
      { take: 'asesor1' },
      { release: 'resolved' },
    ],
  },
  {
    name: 'pilar',
    token: 'demo-co-3',
    customerId: 'CLI-JLLEM8RQT11E',
    user: 9,
    expected:
      'En espera · solo Cancelación (su reclamo anterior está resuelto)',
    steps: [
      {
        chat: complaint(
          '2392',
          'el de Uber de 1677240.58 del 2 de junio',
          'ese día no pedí ningún Uber',
        ),
      },
      { take: 'asesor2' },
      { release: 'resolved' },
      { chat: cancel('2392', 'porque la cuota de manejo es muy alta') },
    ],
  },
  {
    name: 'antonio',
    token: 'demo-ar-3',
    customerId: 'CLI-MO9NTQLU8K63',
    user: 10,
    expected:
      'En espera · Cancelación (con la abierta, aunque tiene una más nueva resuelta)',
    steps: [
      { chat: cancel('2705', 'porque me mudo de país') },
      {
        chat: [
          '¿cuál es el saldo de mi cuenta corriente?',
          'no gracias, eso es todo',
        ],
      },
    ],
  },
  {
    name: 'marco',
    token: 'demo-ar-4',
    customerId: 'CLI-BTHO9TGJDB68',
    user: 11,
    expected: 'Con AI (handoff devuelto a David; no cuenta en la Bandeja)',
    steps: [
      {
        chat: complaint(
          '4568',
          'el de Clínica Médica de 105662.81 del 3 de junio',
          'no me atendí en esa clínica',
        ),
      },
      { take: 'asesor1' },
      { release: 'returned_to_agent' },
    ],
  },
];

async function advisorPost(
  headers: Record<string, string>,
  path: string,
  data: unknown,
) {
  const response = await fetch(`${BASE}/api/advisor/conversations/${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    console.warn(
      `  [${path}] HTTP ${response.status}: ${await response.text()}`,
    );
  }
}

async function seed(customer: SeedCustomer) {
  const headers = headersFor('local', customer.user);
  let chatId: string | undefined;
  let holder: 'asesor1' | 'asesor2' | undefined;
  let turn = 0;

  for (const step of customer.steps) {
    if ('chat' in step || 'more' in step) {
      const messages = 'chat' in step ? step.chat : step.more;
      const result = await runScenario(
        BASE,
        headers,
        {
          name: `${customer.name}-${++turn}`,
          description: customer.expected,
          sessionToken: customer.token,
          customer: customer.user,
          messages,
        },
        0,
        'more' in step && chatId ? chatId : undefined,
      );
      chatId = result.chatId;
    } else if ('take' in step && chatId) {
      holder = step.take;
      await advisorPost(advisor(holder), `${chatId}/take`, {});
    } else if ('release' in step && chatId && holder) {
      await advisorPost(advisor(holder), `${chatId}/release`, {
        outcome: step.release,
      });
    }
  }
}

// What the console reports for each seeded customer, by their row in the
// grouped inbox (open views pick the in-progress chat, Resueltas the latest
// resolved one).
async function report(customers: SeedCustomer[]) {
  const get = async (query: string) =>
    (await (
      await fetch(
        `${BASE}/api/advisor/conversations?groupBy=customer&limit=100${query}`,
        {
          headers: ADMIN,
        },
      )
    ).json()) as { chats: Array<Record<string, any>> };
  const [open, david, closed] = await Promise.all([
    get('&status=open'),
    get('&status=open&handledBy=ai_agent'),
    get('&status=closed'),
  ]);
  const rows = customers.map((c) => {
    const key = c.customerId;
    const inOpen = [...open.chats, ...david.chats].find(
      (r) => r.customerKey === key,
    );
    const inClosed = closed.chats.find((r) => r.customerKey === key);
    const row = inOpen ?? inClosed;
    return {
      cliente: `${row?.customerName ?? c.name} (${c.token})`,
      esperado: c.expected,
      vista: inOpen
        ? inOpen.handledBy === 'ai_agent'
          ? 'Con AI'
          : inOpen.handledBy === 'human_queue'
            ? 'En espera'
            : `Con asesor (${inOpen.assignedTo})`
        : inClosed
          ? 'Resueltas'
          : '—',
      motivo: inOpen?.handoff?.reason ?? inClosed?.handoff?.reason ?? null,
      conversaciones: row?.conversationCount ?? 0,
    };
  });
  console.log('\n=== Clientes sembrados → vista');
  console.table(rows);

  const counts = await (
    await fetch(`${BASE}/api/advisor/conversations/counts?groupBy=customer`, {
      headers: ADMIN,
    })
  ).json();
  console.log('counts?groupBy=customer:', JSON.stringify(counts));
}

async function main() {
  const onlyIndex = process.argv.indexOf('--only');
  const only =
    onlyIndex >= 0 ? process.argv[onlyIndex + 1]?.split(',') : undefined;
  const customers = only ? MATRIX.filter((c) => only.includes(c.name)) : MATRIX;

  for (const customer of customers) await seed(customer);
  await report(MATRIX);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
