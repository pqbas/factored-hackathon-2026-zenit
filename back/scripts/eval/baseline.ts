// The baseline the LLM classifier is compared against: keyword rules, written
// here and not taken from the agent's own fallback, so the classifier isn't
// compared with itself. First rule that matches wins; es and pt.

const RULES: Array<[intent: string, pattern: RegExp]> = [
  [
    'COMPLAINT',
    /reclam|cobro|cobraron|cargo|compra .*n[aã]o fiz|n[aã]o fiz|cobran[cç]a|valor cobrado/i,
  ],
  ['RETENTION', /cancel|dar de baja|d[eé]nla de baja|de baja|cerrar|encerrar/i],
  [
    'GENERAL_INQUIRY',
    /saldo|movimientos|movimentos|cupo|l[ií]mite|limite|poupan|ahorro|compras|deuda|debo|cu[aá]nta plata/i,
  ],
  [
    'GREETING',
    /^\s*(hola|buenas|buenos d[ií]as|oi|ol[aá]|bom dia|boa tarde)\b/i,
  ],
  ['HUMAN_AGENT', /persona|asesor|humano|atendente|pessoa/i],
  ['GOODBYE', /gracias|obrigad|eso es todo|isso [eé] tudo|adi[oó]s|tchau/i],
];

const CASE_MENTION = /reclam/i;
const STATUS_WORDS =
  /c[oó]mo va|estado|avance|andamento|status|novedad|saber de/i;

export function keywordIntent(text: string): string {
  // A claim plus a status word asks about an existing case, not a new one.
  if (CASE_MENTION.test(text) && STATUS_WORDS.test(text)) return 'CASE_STATUS';
  for (const [intent, pattern] of RULES) {
    if (pattern.test(text)) return intent;
  }
  return 'OUT_OF_SCOPE';
}
