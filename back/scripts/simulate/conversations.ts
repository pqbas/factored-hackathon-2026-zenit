// The day's conversations: motives and their shares, and the deterministic
// templates (es / pt) each one is made of. Pure: no I/O, no import.meta, so
// the unit tests load it. The same seed gives the same plan.

export type Motive =
  | 'transaccional'
  | 'producto'
  | 'reclamo'
  | 'estado_reclamo'
  | 'tecnico'
  | 'comercial'
  | 'retencion';

// call_center_interactions: Transaccional 35, Producto 22, Queja 17 (12
// reclamo + 5 estado), Técnico 15, Comercial 8, Retención 3.
export const MOTIVE_SHARES: Record<Motive, number> = {
  transaccional: 35,
  producto: 22,
  reclamo: 12,
  estado_reclamo: 5,
  tecnico: 15,
  comercial: 8,
  retencion: 3,
};
export const MOTIVES = Object.keys(MOTIVE_SHARES) as Motive[];

export const PT_SHARE = 0.2;
// Share of the consultas that end with a goodbye, so the AI resolves them.
const GOODBYE_SHARE = 0.4;

export type Language = 'es' | 'pt';

export type SimCustomer = {
  customerId: string;
  firstName: string;
  country: string;
  cardLast4: string | null;
  savingsLast4: string | null;
  // Latest charge with a merchant on an active credit card.
  charge: {
    merchant: string;
    amount: number;
    currency: string;
    // YYYY-MM-DD
    date: string;
    last4: string;
  } | null;
  cases: Array<{ id: string; category: string | null; status: string | null }>;
};

export type Assignment = { motive: Motive; customer: SimCustomer };

export type PlanItem = {
  index: number;
  motive: Motive;
  language: Language;
  customer: SimCustomer;
  messages: string[];
  // The last message says goodbye.
  goodbye: boolean;
};

// Largest remainder: the counts sum exactly to `count`.
export function allocateMix(count: number): Record<Motive, number> {
  const total = MOTIVES.reduce((sum, m) => sum + MOTIVE_SHARES[m], 0);
  const exact = MOTIVES.map((m) => (count * MOTIVE_SHARES[m]) / total);
  const counts = exact.map(Math.floor);
  let left = count - counts.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    counts[i]++;
    left--;
  }
  return Object.fromEntries(MOTIVES.map((m, i) => [m, counts[i]])) as Record<
    Motive,
    number
  >;
}

export function seededRandom(seed: string): () => number {
  // FNV-1a into mulberry32.
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T>(rng: Rng, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];
const int = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const fmtAmount = (n: number, currency: string) =>
  `${n.toFixed(2)} ${currency}`;
// dd/mm/yyyy from YYYY-MM-DD.
const fmtDate = (iso: string) => iso.split('-').reverse().join('/');

type Text = Record<Language, string[]>;

const GOODBYE: Text = {
  es: [
    'no gracias, eso es todo',
    'gracias, eso es todo',
    'no, nada más, gracias',
    'listo, muchas gracias',
  ],
  pt: [
    'não, obrigado, é só isso',
    'obrigado, é só isso',
    'não, mais nada, obrigado',
    'pronto, muito obrigado',
  ],
};

function consultaMessages(
  rng: Rng,
  lang: Language,
  c: SimCustomer,
  motive: 'transaccional' | 'producto',
  goodbye: boolean,
): string[] {
  const card = c.cardLast4;
  const sav = c.savingsLast4;
  // The product the first question is about: a card when there is one.
  const useCard = card !== null && (sav === null || rng() < 0.6);
  const last4 = (useCard ? card : sav) as string;
  const es = useCard
    ? motive === 'transaccional'
      ? [
          `hola, quiero saber cuál es el saldo de mi tarjeta terminada en ${last4}`,
          `buenas, me puedes decir los últimos movimientos de mi tarjeta ${last4}?`,
          `necesito ver cuánto debo en la tarjeta que termina en ${last4}`,
          `hola, cuáles fueron mis últimas compras con la tarjeta ${last4}?`,
        ]
      : [
          `hola, cuál es el cupo de mi tarjeta terminada en ${last4}?`,
          `buenas, cuánto me queda disponible en la tarjeta ${last4}?`,
          `quisiera saber el límite de crédito de mi tarjeta ${last4}`,
          `hola, cuál es el saldo y el cupo disponible de la tarjeta ${last4}?`,
        ]
    : motive === 'transaccional'
      ? [
          `hola, quiero saber el saldo de mi cuenta de ahorro terminada en ${last4}`,
          `buenas, me puedes decir los últimos movimientos de mi cuenta ${last4}?`,
          `necesito ver cuánto tengo en la cuenta de ahorros que termina en ${last4}`,
        ]
      : [
          `hola, qué saldo tiene mi cuenta de ahorro ${last4}?`,
          `buenas, cuánto dinero hay en mi cuenta de ahorros terminada en ${last4}?`,
          `quisiera consultar mi cuenta de ahorro ${last4}`,
        ];
  const pt = useCard
    ? motive === 'transaccional'
      ? [
          `olá, quero saber o saldo do meu cartão final ${last4}`,
          `bom dia, pode me dizer os últimos movimentos do meu cartão ${last4}?`,
          `preciso ver quanto devo no cartão que termina em ${last4}`,
          `olá, quais foram minhas últimas compras com o cartão ${last4}?`,
        ]
      : [
          `olá, qual é o limite do meu cartão final ${last4}?`,
          `bom dia, quanto ainda tenho disponível no cartão ${last4}?`,
          `gostaria de saber o limite de crédito do meu cartão ${last4}`,
          `olá, qual é o saldo e o limite disponível do cartão ${last4}?`,
        ]
    : motive === 'transaccional'
      ? [
          `olá, quero saber o saldo da minha conta poupança final ${last4}`,
          `bom dia, pode me dizer os últimos movimentos da conta ${last4}?`,
          `preciso ver quanto tenho na poupança que termina em ${last4}`,
        ]
      : [
          `olá, qual é o saldo da minha conta poupança ${last4}?`,
          `bom dia, quanto dinheiro tem na minha poupança final ${last4}?`,
          `gostaria de consultar minha conta poupança ${last4}`,
        ];
  const followEs = [
    'y los últimos movimientos?',
    'y cuál es el saldo actual?',
    'me lo puedes repetir más despacio?',
    'perfecto, y de qué fecha es el último movimiento?',
  ];
  const followPt = [
    'e os últimos movimentos?',
    'e qual é o saldo atual?',
    'pode repetir mais devagar?',
    'perfeito, e de que data é o último movimento?',
  ];
  const first = pick(rng, lang === 'es' ? es : pt);
  const total = int(rng, 2, 4);
  const middle = total - 1 - (goodbye ? 1 : 0);
  const follows = shuffle(rng, lang === 'es' ? followEs : followPt).slice(
    0,
    middle,
  );
  return [first, ...follows, ...(goodbye ? [pick(rng, GOODBYE[lang])] : [])];
}

function reclamoMessages(rng: Rng, lang: Language, c: SimCustomer): string[] {
  const ch = c.charge as NonNullable<SimCustomer['charge']>;
  const amount = fmtAmount(ch.amount, ch.currency);
  const date = fmtDate(ch.date);
  const first =
    lang === 'es'
      ? pick(rng, [
          `no reconozco un cargo de ${ch.merchant} por ${amount} del ${date} en mi tarjeta ${ch.last4}`,
          `hola, veo un cobro de ${ch.merchant} por ${amount} el ${date} en la tarjeta ${ch.last4} y no lo reconozco`,
          `me aparece un cargo de ${amount} en ${ch.merchant} del ${date} en mi tarjeta terminada en ${ch.last4}, yo no lo hice`,
        ])
      : pick(rng, [
          `não reconheço uma cobrança de ${ch.merchant} de ${amount} em ${date} no meu cartão ${ch.last4}`,
          `olá, vejo uma cobrança de ${ch.merchant} de ${amount} em ${date} no cartão ${ch.last4} e não a reconheço`,
          `apareceu uma cobrança de ${amount} em ${ch.merchant} de ${date} no meu cartão final ${ch.last4}, eu não fiz isso`,
        ]);
  const description =
    lang === 'es'
      ? pick(rng, [
          'yo no hice esa compra, nunca he comprado en ese comercio',
          'la tarjeta la tengo conmigo y no autoricé ese cobro',
          'no estuve en ese lugar ni compré nada ahí en esa fecha',
        ])
      : pick(rng, [
          'eu não fiz essa compra, nunca comprei nesse estabelecimento',
          'estou com o cartão comigo e não autorizei essa cobrança',
          'não estive nesse lugar nem comprei nada lá nessa data',
        ]);
  const confirm =
    lang === 'es'
      ? pick(rng, ['sí, confirmo', 'sí, confirmo los datos', 'sí, es correcto'])
      : pick(rng, [
          'sim, confirmo',
          'sim, confirmo os dados',
          'sim, está correto',
        ]);
  return [first, description, confirm];
}

function estadoReclamoMessages(
  rng: Rng,
  lang: Language,
  c: SimCustomer,
): string[] {
  const kase = pick(rng, c.cases);
  const category = kase.category ?? 'cobro';
  const first =
    lang === 'es'
      ? pick(rng, [
          `cómo va mi reclamo por ${category}?`,
          `hola, quiero saber en qué estado está el reclamo de ${category} que hice`,
          `buenas, tengo un reclamo abierto de ${category}, me pueden dar novedades?`,
        ])
      : pick(rng, [
          `como está minha reclamação de ${category}?`,
          `olá, quero saber em que estado está a reclamação de ${category} que fiz`,
          `bom dia, tenho uma reclamação aberta de ${category}, têm novidades?`,
        ]);
  const second =
    lang === 'es'
      ? pick(rng, ['sí, ese', 'sí, ese mismo', 'sí, ese es'])
      : pick(rng, ['sim, esse', 'sim, esse mesmo', 'sim, é esse']);
  const third = pick(rng, GOODBYE[lang]);
  return rng() < 0.5 ? [first, second] : [first, second, third];
}

function tecnicoMessages(rng: Rng, lang: Language): string[] {
  const issues: Text[] = [
    {
      es: [
        'no puedo entrar a la app del banco',
        'la app del banco me dice error al iniciar sesión',
      ],
      pt: [
        'não consigo entrar no app do banco',
        'o app do banco dá erro ao iniciar sessão',
      ],
    },
    {
      es: ['olvidé mi clave del banco', 'se me bloqueó la clave de mi cuenta'],
      pt: [
        'esqueci minha senha do banco',
        'minha senha da conta foi bloqueada',
      ],
    },
    {
      es: [
        'el cajero automático no me dio el dinero pero me descontó',
        'me tragó la tarjeta el cajero automático',
      ],
      pt: [
        'o caixa eletrônico não me deu o dinheiro mas descontou',
        'o caixa eletrônico engoliu meu cartão',
      ],
    },
  ];
  const details: Text = {
    es: [
      'me pasa desde ayer',
      'ya lo intenté varias veces y nada',
      'necesito que me ayuden hoy mismo',
    ],
    pt: [
      'acontece desde ontem',
      'já tentei várias vezes e nada',
      'preciso que me ajudem hoje mesmo',
    ],
  };
  const issue = pick(rng, issues);
  const messages = [pick(rng, issue[lang]), pick(rng, details[lang])];
  if (rng() < 0.4) {
    messages.push(
      lang === 'es' ? 'quedo atento, gracias' : 'fico no aguardo, obrigado',
    );
  }
  return messages;
}

function comercialMessages(rng: Rng, lang: Language): string[] {
  const offers: Array<{ ask: Text; detail: Text }> = [
    {
      ask: {
        es: [
          'quiero pedir un préstamo',
          'hola, me interesa un préstamo personal',
        ],
        pt: [
          'quero pedir um empréstimo',
          'olá, tenho interesse em um empréstimo pessoal',
        ],
      },
      detail: {
        es: ['unos 5 mil, a 24 meses', 'necesito algo para pagar en un año'],
        pt: ['uns 5 mil, em 24 meses', 'preciso de algo para pagar em um ano'],
      },
    },
    {
      ask: {
        es: [
          'quiero contratar un seguro',
          'hola, me interesa un seguro de vida',
        ],
        pt: [
          'quero contratar um seguro',
          'olá, tenho interesse em um seguro de vida',
        ],
      },
      detail: {
        es: ['para mi familia', 'quisiera saber cuánto cuesta al mes'],
        pt: ['para minha família', 'gostaria de saber quanto custa por mês'],
      },
    },
    {
      ask: {
        es: [
          'quiero abrir una cuenta nueva',
          'hola, cómo abro otra cuenta de ahorro?',
        ],
        pt: [
          'quero abrir uma conta nova',
          'olá, como abro outra conta poupança?',
        ],
      },
      detail: {
        es: ['sería para ahorrar en dólares', 'qué requisitos piden?'],
        pt: ['seria para poupar em dólares', 'quais requisitos pedem?'],
      },
    },
  ];
  const offer = pick(rng, offers);
  const messages = [pick(rng, offer.ask[lang]), pick(rng, offer.detail[lang])];
  if (rng() < 0.4) messages.push(pick(rng, GOODBYE[lang]));
  return messages;
}

function retencionMessages(rng: Rng, lang: Language, c: SimCustomer): string[] {
  const last4 = c.cardLast4 as string;
  const first =
    lang === 'es'
      ? pick(rng, [
          `quiero cancelar mi tarjeta ${last4}`,
          `hola, quiero dar de baja mi tarjeta terminada en ${last4}`,
          `buenas, necesito cancelar la tarjeta ${last4}`,
        ])
      : pick(rng, [
          `quero cancelar meu cartão ${last4}`,
          `olá, quero encerrar meu cartão final ${last4}`,
          `bom dia, preciso cancelar o cartão ${last4}`,
        ]);
  const reason =
    lang === 'es'
      ? pick(rng, [
          'es que me cobran mucha comisión de manejo',
          'ya no la uso y prefiero no pagar cuota',
          'me ofrecieron una mejor tarjeta en otro banco',
        ])
      : pick(rng, [
          'é que cobram muita taxa de manutenção',
          'já não uso e prefiro não pagar anuidade',
          'me ofereceram um cartão melhor em outro banco',
        ]);
  const insist =
    lang === 'es'
      ? 'no, ya lo decidí, quiero cancelarla'
      : 'não, já decidi, quero cancelar';
  return rng() < 0.4 ? [first, reason, insist] : [first, reason];
}

// The plan of a day: one conversation per assignment, with its language and
// messages. Same assignments and seed give the same plan.
export function buildPlan(assignments: Assignment[], seed: string): PlanItem[] {
  const rng = seededRandom(seed);
  // Exactly round(PT_SHARE * n) in pt, spread at random.
  const ptCount = Math.round(assignments.length * PT_SHARE);
  const ptIndexes = new Set(
    shuffle(
      rng,
      assignments.map((_, i) => i),
    ).slice(0, ptCount),
  );

  return assignments.map(({ motive, customer }, index) => {
    const language: Language = ptIndexes.has(index) ? 'pt' : 'es';
    let messages: string[];
    let goodbye = false;
    switch (motive) {
      case 'transaccional':
      case 'producto':
        goodbye = rng() < GOODBYE_SHARE;
        messages = consultaMessages(rng, language, customer, motive, goodbye);
        break;
      case 'reclamo':
        messages = reclamoMessages(rng, language, customer);
        break;
      case 'estado_reclamo':
        messages = estadoReclamoMessages(rng, language, customer);
        break;
      case 'tecnico':
        messages = tecnicoMessages(rng, language);
        break;
      case 'comercial':
        messages = comercialMessages(rng, language);
        break;
      case 'retencion':
        messages = retencionMessages(rng, language, customer);
        break;
    }
    return { index, motive, language, customer, messages, goodbye };
  });
}

export type AdvisorAction = 'resolved' | 'returned_to_agent' | 'taken' | 'none';

// ~40% take + resolve, ~20% take + return to David, ~20% take only, ~20%
// left waiting; deterministic by seed. Exact proportions over `n` handoffs.
export function planAdvisorActions(n: number, seed: string): AdvisorAction[] {
  const rng = seededRandom(`${seed}:advisor`);
  const shares: Array<[AdvisorAction, number]> = [
    ['resolved', 0.4],
    ['returned_to_agent', 0.2],
    ['taken', 0.2],
    ['none', 0.2],
  ];
  const actions: AdvisorAction[] = [];
  for (const [action, share] of shares) {
    for (let i = 0; i < Math.round(n * share); i++) actions.push(action);
  }
  while (actions.length < n) actions.push('none');
  return shuffle(rng, actions.slice(0, n));
}
