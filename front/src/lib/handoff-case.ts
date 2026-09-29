// The case David handed off to an advisor (agent PR #70, back contract): the
// reason, a short summary and the data he verified against the bank. Shown
// as it comes: labels are translated, values are never made up.

import { format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export interface AgentHandoff {
  reason: string | null;
  summary: string | null;
  // facts.verified_data as the agent sent it (snake_case keys).
  verifiedData: Record<string, unknown> | null;
  facts: Record<string, unknown> | null;
  at: string;
  // Set once the advisor resolves or returns the conversation.
  resolvedAt: string | null;
}

const REASON: Record<string, { label: string; short: string }> = {
  complaint: { label: 'Reclamo por un cargo', short: 'Reclamo por cargo' },
  retention: { label: 'Cancelación de un producto', short: 'Cancelación' },
  case_status: { label: 'Estado de un reclamo', short: 'Estado de reclamo' },
};

// The three reasons David hands a case to the inbox, in filter order
// (docs/flujo-atencion.md). Filters and inbox sections use these.
export const HANDOFF_REASONS = [
  { id: 'complaint', label: 'Reclamo' },
  { id: 'retention', label: 'Cancelación de producto' },
  { id: 'case_status', label: 'Estado de un reclamo' },
] as const;

// The short name filters and inbox sections show for a reason.
export function handoffReasonGroupLabel(id: string): string {
  return HANDOFF_REASONS.find((r) => r.id === id)?.label ?? handoffReasonLabel(id);
}

// Section id for conversations without a handoff.
export const NO_HANDOFF_GROUP = 'NONE';

export function handoffReasonLabel(reason: string | null | undefined): string {
  if (!reason) return 'Caso derivado';
  return REASON[reason]?.label ?? reason;
}

export function handoffReasonShort(reason: string | null | undefined): string {
  if (!reason) return 'Derivado';
  return REASON[reason]?.short ?? reason;
}

const COMPLAINT_TYPE: Record<string, string> = {
  not_recognized: 'No reconoce el cargo',
  duplicate_charge: 'Cobro duplicado',
  different_amount: 'Monto distinto al esperado',
};

const LABEL: Record<string, string> = {
  card_last4: 'Tarjeta',
  product_type: 'Producto',
  product_last4: 'Producto',
  transaction_date: 'Fecha del cargo',
  merchant: 'Comercio',
  amount: 'Monto',
  transaction_status: 'Estado del cargo',
  complaint_type: 'Tipo',
  description: 'Descripción',
  reason: 'Motivo',
};

// Keys shown together with another one, not on their own row.
const FOLDED = new Set(['currency', 'product_last4']);

export interface CaseField {
  key: string;
  label: string;
  value: string;
}

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const s = typeof value === 'string' ? value : String(value);
  return s.trim() ? s : null;
};

function money(amount: unknown, currency: unknown): string | null {
  const value = typeof amount === 'number' ? amount : Number(amount);
  if (amount === null || amount === undefined || Number.isNaN(value)) return text(amount);
  const code = text(currency);
  try {
    return new Intl.NumberFormat('es', {
      style: 'currency',
      currency: code ?? 'USD',
      currencyDisplay: 'code',
    }).format(value);
  } catch {
    return `${value.toLocaleString('es')}${code ? ` ${code}` : ''}`;
  }
}

function day(value: unknown): string | null {
  const s = text(value);
  if (!s) return null;
  const parsed = parseISO(s);
  return isValid(parsed) ? format(parsed, 'd MMM yyyy', { locale: es }) : s;
}

// The verified data as a card's rows, in a fixed order, then any other key
// the agent sent (labelled by its key).
export function caseFields(handoff: AgentHandoff | null | undefined): CaseField[] {
  const data = handoff?.verifiedData;
  if (!data || typeof data !== 'object') return [];
  const fields: CaseField[] = [];
  const push = (key: string, value: string | null) => {
    if (value) fields.push({ key, label: LABEL[key] ?? key, value });
  };
  const order = [
    'card_last4',
    'product_type',
    'transaction_date',
    'merchant',
    'amount',
    'transaction_status',
    'complaint_type',
    'description',
    'reason',
  ];
  for (const key of order) {
    if (!(key in data)) continue;
    const value = data[key];
    if (key === 'card_last4') push(key, text(value) && `••${text(value)}`);
    else if (key === 'product_type') {
      const last4 = text(data.product_last4);
      push(key, [text(value), last4 && `••${last4}`].filter(Boolean).join(' '));
    } else if (key === 'transaction_date') push(key, day(value));
    else if (key === 'amount') push(key, money(value, data.currency));
    else if (key === 'complaint_type') push(key, text(value) && (COMPLAINT_TYPE[String(value)] ?? String(value)));
    else push(key, text(value));
  }
  if ('product_last4' in data && !('product_type' in data)) push('product_last4', text(data.product_last4) && `••${text(data.product_last4)}`);
  for (const [key, value] of Object.entries(data)) {
    if (order.includes(key) || FOLDED.has(key)) continue;
    push(key, typeof value === 'object' ? JSON.stringify(value) : text(value));
  }
  return fields;
}
