// The case David handed off to an advisor (agent PR #70, back contract): the
// reason, a short summary and the data he verified against the bank. Shown
// as it comes: labels are translated, values are never made up.

import { format, isValid, parseISO } from 'date-fns';

import { dateLocale, intlLocale, tr } from '@/lib/i18n';

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

// No numeric score is shown while the experiment has no validated inference artifact.
export function needsFraudReview(handoff: AgentHandoff): boolean {
  const assessment = handoff.facts?.fraud_assessment;
  return handoff.reason === 'complaint' && typeof assessment === 'object' && assessment !== null
    && !Array.isArray(assessment)
    && (assessment as Record<string, unknown>).review_required === true;
}

// The three reasons David hands a case to the inbox, in filter order
// (docs/flujo-atencion.md). One name per reason, used everywhere: filters,
// sections, header chip, handoff card, dividers.
export const HANDOFF_REASONS = [
  { id: 'complaint', get label() { return tr().console.reasons.complaint; } },
  { id: 'retention', get label() { return tr().console.reasons.retention; } },
  { id: 'case_status', get label() { return tr().console.reasons.caseStatus; } },
] as const;

export function handoffReasonLabel(reason: string | null | undefined): string {
  if (!reason) return tr().console.reasons.fallback;
  return HANDOFF_REASONS.find((r) => r.id === reason)?.label ?? reason;
}

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
    return new Intl.NumberFormat(intlLocale(), {
      style: 'currency',
      currency: code ?? 'USD',
      currencyDisplay: 'code',
    }).format(value);
  } catch {
    return `${value.toLocaleString(intlLocale())}${code ? ` ${code}` : ''}`;
  }
}

function day(value: unknown): string | null {
  const s = text(value);
  if (!s) return null;
  const parsed = parseISO(s);
  return isValid(parsed) ? format(parsed, 'd MMM yyyy', { locale: dateLocale() }) : s;
}

// The verified data as a card's rows, in a fixed order, then any other key
// the agent sent (labelled by its key).
export function caseFields(handoff: AgentHandoff | null | undefined): CaseField[] {
  const data = handoff?.verifiedData;
  if (!data || typeof data !== 'object') return [];
  const { caseLabels: LABEL, complaintTypes: COMPLAINT_TYPE } = tr().console;
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
