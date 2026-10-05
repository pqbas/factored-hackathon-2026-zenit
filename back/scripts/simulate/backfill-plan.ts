import {
  type Assignment,
  MOTIVES,
  type Motive,
  type SimCustomer,
  seededRandom,
} from './conversations';

// The pure part of simulate:backfill: which demo chats each past day gets, who
// closed them and what they said. No I/O and no import.meta, so the tests load
// it. The metrics screen counts ResolutionEvent rows (getResolutionMetrics).

export type Category = 'ai' | 'assisted' | 'human';
export type Lang = 'es' | 'pt';

// Target mix of the demo: AI alone, AI after a person stepped in, a person.
export const CATEGORY_SHARES: Record<Category, number> = {
  ai: 0.65,
  assisted: 0.2,
  human: 0.15,
};
export const CATEGORIES: Category[] = ['ai', 'assisted', 'human'];

// The keys front/src/lib/advisor.ts labels; null is "Otras".
const USE_CASES: Record<Category, Array<string | null>> = {
  ai: ['GENERAL_INQUIRY', 'GENERAL_INQUIRY', 'GENERAL_INQUIRY', 'CASE_STATUS', null],
  assisted: ['COMPLAINT', 'COMPLAINT', 'GENERAL_INQUIRY'],
  human: ['COMPLAINT', 'COMPLAINT', 'CANCEL', 'COMMERCIAL', 'HUMAN_AGENT'],
};
export const VALID_USE_CASES = new Set(
  Object.values(USE_CASES).flat().filter((u): u is string => u !== null),
);

const PT_SHARE = 0.2;
// Lima is UTC-5 all year (no DST).
const LIMA_OFFSET_H = 5;
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 20;

export type BackfillItem = {
  day: string;
  category: Category;
  useCase: string | null;
  language: Lang;
  // When the customer wrote first; the rest of the messages follow it.
  startedAt: Date;
};

const isDay = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function daysBetween(from: string, to: string): string[] {
  if (!isDay(from) || !isDay(to)) throw new Error('days must be YYYY-MM-DD');
  const days: string[] = [];
  const d = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (d > end) throw new Error('--from is after --to');
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

const between = (rand: () => number, lo: number, hi: number) =>
  lo + Math.floor(rand() * (hi - lo + 1));

export function isWeekend(day: string): boolean {
  const dow = new Date(`${day}T12:00:00.000Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

// A bank's contact center is quieter on weekends.
export function dailyCount(day: string, rand: () => number): number {
  return isWeekend(day) ? between(rand, 12, 20) : between(rand, 25, 40);
}

// Largest remainder: the counts always add up to n.
export function allocateCategories(n: number): Record<Category, number> {
  const raw = CATEGORIES.map((c) => ({ c, v: n * CATEGORY_SHARES[c] }));
  const out = Object.fromEntries(
    raw.map(({ c, v }) => [c, Math.floor(v)]),
  ) as Record<Category, number>;
  let left = n - CATEGORIES.reduce((s, c) => s + out[c], 0);
  for (const { c } of [...raw].sort(
    (a, b) => (b.v % 1) - (a.v % 1),
  )) {
    if (left-- <= 0) break;
    out[c]++;
  }
  return out;
}

export function useCaseFor(category: Category, rand: () => number) {
  const options = USE_CASES[category];
  return options[Math.floor(rand() * options.length)];
}

// A minute between OPEN_HOUR and CLOSE_HOUR in Lima, as a UTC instant.
export function businessTimeUtc(day: string, rand: () => number): Date {
  const minute = Math.floor(rand() * (CLOSE_HOUR - OPEN_HOUR) * 60);
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCHours(OPEN_HOUR + LIMA_OFFSET_H, minute, Math.floor(rand() * 60));
  return d;
}

export function buildBackfillPlan({
  from,
  to,
  seed = 'backfill',
}: {
  from: string;
  to: string;
  seed?: string;
}): BackfillItem[] {
  const items: BackfillItem[] = [];
  for (const day of daysBetween(from, to)) {
    const rand = seededRandom(`${seed}:${day}`);
    const counts = allocateCategories(dailyCount(day, rand));
    const dayItems: BackfillItem[] = [];
    for (const category of CATEGORIES) {
      for (let i = 0; i < counts[category]; i++) {
        dayItems.push({
          day,
          category,
          useCase: useCaseFor(category, rand),
          language: rand() < PT_SHARE ? 'pt' : 'es',
          startedAt: businessTimeUtc(day, rand),
        });
      }
    }
    dayItems.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    items.push(...dayItems);
  }
  return items;
}

export type Sender = 'customer' | 'ai_agent' | 'human_agent' | 'system';
export type PlannedMessage = { sender: Sender; text: string; at: Date };

type Texts = {
  question: Record<string, string>;
  answer: Record<string, string>;
  handoff: string;
  taken: string;
  advisor: string;
  thanks: string;
  bye: string;
  closed: string;
};

const TEXT: Record<Lang, Texts> = {
  es: {
    question: {
      GENERAL_INQUIRY: '¿Cuál es el saldo de mi tarjeta de crédito?',
      CASE_STATUS: '¿Cómo va el reclamo que hice la semana pasada?',
      COMPLAINT: 'Tengo un cargo que no reconozco en mi tarjeta',
      CANCEL: 'Quiero cancelar mi tarjeta de crédito',
      COMMERCIAL: 'Me interesa un préstamo personal, ¿qué opciones tengo?',
      HUMAN_AGENT: 'Necesito hablar con un asesor, por favor',
      NONE: '¿A qué hora atiende la agencia del centro?',
    },
    answer: {
      GENERAL_INQUIRY:
        'Te muestro el saldo de tu producto.',
      CASE_STATUS:
        'Tu reclamo sigue en revisión; el equipo responde dentro de los próximos 5 días hábiles.',
      COMPLAINT:
        'Encontré el cargo. Para revisarlo con detalle te paso con un asesor, que ya tiene los datos del movimiento.',
      CANCEL:
        'Entiendo. Registré tu pedido y te paso con un asesor para completar la cancelación.',
      COMMERCIAL:
        'Un asesor comercial te puede dar las opciones según tu perfil; te paso con uno.',
      HUMAN_AGENT: 'Claro, te paso con un asesor.',
      NONE: 'La agencia del centro atiende de lunes a viernes de 9:00 a 18:00.',
    },
    handoff: 'Te paso con un asesor. Ya tiene el resumen de tu caso.',
    taken: 'Te atiende un asesor.',
    advisor: 'Hola, ya revisé tu caso y quedó resuelto. ¿Hay algo más en lo que te pueda ayudar?',
    thanks: 'gracias, eso es todo',
    bye: '¡Gracias a ti! Que tengas un buen día.',
    closed: 'La conversación se cerró.',
  },
  pt: {
    question: {
      GENERAL_INQUIRY: 'Qual é o saldo do meu cartão de crédito?',
      CASE_STATUS: 'Como está a reclamação que fiz semana passada?',
      COMPLAINT: 'Tem uma cobrança que não reconheço no meu cartão',
      CANCEL: 'Quero cancelar meu cartão de crédito',
      COMMERCIAL: 'Tenho interesse em um empréstimo pessoal, quais opções existem?',
      HUMAN_AGENT: 'Preciso falar com um atendente, por favor',
      NONE: 'Qual o horário da agência do centro?',
    },
    answer: {
      GENERAL_INQUIRY:
        'Vou te mostrar o saldo do seu produto.',
      CASE_STATUS:
        'Sua reclamação continua em análise; a equipe responde nos próximos 5 dias úteis.',
      COMPLAINT:
        'Encontrei a cobrança. Para analisar em detalhe, vou te passar para um atendente, que já tem os dados.',
      CANCEL:
        'Entendi. Registrei seu pedido e vou te passar para um atendente concluir o cancelamento.',
      COMMERCIAL:
        'Um atendente comercial pode te mostrar as opções para o seu perfil; vou te passar para um.',
      HUMAN_AGENT: 'Claro, vou te passar para um atendente.',
      NONE: 'A agência do centro atende de segunda a sexta, das 9h às 18h.',
    },
    handoff: 'Vou te passar para um atendente. Ele já tem o resumo do seu caso.',
    taken: 'Te atiende un asesor.',
    advisor: 'Olá, já revisei seu caso e está resolvido. Posso ajudar em mais alguma coisa?',
    thanks: 'obrigado, é só isso',
    bye: 'Obrigado a você! Tenha um ótimo dia.',
    closed: 'La conversación se cerró.',
  },
};

// What the messages say about the chat's customer, from bank_ro, so the
// console's customer panel matches the conversation.
export type CustomerFacts = {
  customerId: string;
  name: string;
  product: {
    kind: 'card' | 'savings';
    last4: string;
    balance: number | null;
    limit: number | null;
    currency: string;
  } | null;
  charge: { merchant: string; amount: number; currency: string; date: string } | null;
  caseCategory: string | null;
};

const money = (amount: number | null, currency: string) =>
  amount === null
    ? null
    : `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`.trim();

function generalAnswer(lang: Lang, facts: CustomerFacts): string {
  const p = facts.product;
  if (!p) return TEXT[lang].answer.NONE;
  const balance = money(p.balance, p.currency);
  const limit = money(p.limit, p.currency);
  if (lang === 'pt') {
    return p.kind === 'card'
      ? `Seu cartão de crédito final ${p.last4} tem saldo de ${balance ?? 'R$ 0,00'}${limit ? ` e limite de ${limit}` : ''}.`
      : `Sua conta poupança final ${p.last4} tem saldo de ${balance ?? '0,00'}.`;
  }
  return p.kind === 'card'
    ? `Tu tarjeta de crédito terminada en ${p.last4} tiene un saldo de ${balance ?? '0.00'}${limit ? ` y un límite de ${limit}` : ''}.`
    : `Tu cuenta de ahorros terminada en ${p.last4} tiene un saldo de ${balance ?? '0.00'}.`;
}

function questionOf(lang: Lang, key: string, facts: CustomerFacts): string {
  const t = TEXT[lang];
  if (key === 'GENERAL_INQUIRY' && facts.product?.kind === 'savings') {
    return lang === 'pt'
      ? 'Qual é o saldo da minha conta poupança?'
      : '¿Cuál es el saldo de mi cuenta de ahorros?';
  }
  if (key === 'COMPLAINT' && facts.charge) {
    const c = facts.charge;
    return lang === 'pt'
      ? `Não reconheço uma cobrança de ${money(c.amount, c.currency)} em ${c.merchant}`
      : `No reconozco un cargo de ${money(c.amount, c.currency)} en ${c.merchant}`;
  }
  return t.question[key];
}

function answerOf(lang: Lang, key: string, facts: CustomerFacts): string {
  const t = TEXT[lang];
  if (key === 'GENERAL_INQUIRY') return generalAnswer(lang, facts);
  if (key === 'CASE_STATUS' && facts.caseCategory) {
    return lang === 'pt'
      ? `Sua reclamação de "${facts.caseCategory}" continua em análise; a equipe responde nos próximos 5 dias úteis.`
      : `Tu reclamo de "${facts.caseCategory}" sigue en revisión; el equipo responde dentro de los próximos 5 días hábiles.`;
  }
  if (key === 'COMPLAINT' && facts.charge) {
    return lang === 'pt'
      ? `Encontrei a cobrança de ${facts.charge.merchant} do dia ${facts.charge.date}. Vou te passar para um atendente, que já tem os dados.`
      : `Encontré el cargo de ${facts.charge.merchant} del ${facts.charge.date}. Te paso con un asesor, que ya tiene los datos del movimiento.`;
  }
  return t.answer[key];
}

// The chat's messages, a minute or two apart. ai: question, answer, thanks,
// goodbye. assisted: David hands off, an advisor steps in and hands back,
// David says goodbye. human: the advisor closes it.
export function messagesFor(item: BackfillItem, facts: CustomerFacts): PlannedMessage[] {
  const rand = seededRandom(`msg:${facts.customerId}:${item.startedAt.toISOString()}`);
  const t = TEXT[item.language];
  const key = item.useCase ?? 'NONE';
  let at = item.startedAt.getTime();
  const next = (sender: Sender, text: string): PlannedMessage => {
    const msg = { sender, text, at: new Date(at) };
    at += between(rand, 20, 150) * 1000;
    return msg;
  };
  const answer = answerOf(item.language, key, facts);
  const out = [next('customer', questionOf(item.language, key, facts)), next('ai_agent', answer)];
  if (item.category === 'ai') {
    out.push(next('customer', t.thanks), next('ai_agent', t.bye));
    return out;
  }
  // GENERAL_INQUIRY answers and then hands off; the others already say so.
  if (key === 'GENERAL_INQUIRY' || key === 'CASE_STATUS' || key === 'NONE') {
    out.push(next('customer', item.language === 'pt' ? 'Preciso falar com alguém sobre isso' : 'Necesito hablar con alguien sobre esto'));
    out.push(next('ai_agent', t.handoff));
  }
  at += between(rand, 2, 25) * 60_000;
  out.push(next('system', t.taken), next('human_agent', t.advisor));
  out.push(next('customer', t.thanks));
  out.push(item.category === 'human' ? next('system', t.closed) : next('ai_agent', t.bye));
  return out;
}

// simulate:day's picker works by motive; each use case needs what that motive
// needs (a product, a charge, a case).
export function motiveFor(useCase: string | null): Motive {
  switch (useCase) {
    case 'GENERAL_INQUIRY':
      return 'producto';
    case 'CASE_STATUS':
      return 'estado_reclamo';
    case 'COMPLAINT':
      return 'reclamo';
    case 'CANCEL':
      return 'retencion';
    case 'COMMERCIAL':
      return 'comercial';
    default:
      return 'tecnico';
  }
}

export function quotasFor(items: BackfillItem[]): Record<Motive, number> {
  const quotas = Object.fromEntries(MOTIVES.map((m) => [m, 0])) as Record<Motive, number>;
  for (const item of items) quotas[motiveFor(item.useCase)]++;
  return quotas;
}

// Pairs each item with a picked customer of its motive, in order.
export function attachCustomers(
  items: BackfillItem[],
  assignments: Assignment[],
): Array<{ item: BackfillItem; customer: SimCustomer }> {
  const byMotive = new Map<Motive, SimCustomer[]>();
  for (const a of assignments) {
    byMotive.set(a.motive, [...(byMotive.get(a.motive) ?? []), a.customer]);
  }
  return items.map((item) => {
    const motive = motiveFor(item.useCase);
    const customer = byMotive.get(motive)?.shift();
    if (!customer) throw new Error(`No customer left for ${motive}`);
    return { item, customer };
  });
}

// The handoff reason the console shows for a chat that had a person.
export function handoffReasonFor(useCase: string | null): string {
  if (useCase === 'COMPLAINT') return 'complaint';
  if (useCase === 'CANCEL') return 'retention';
  return 'fallback';
}
