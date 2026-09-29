// The bank's history of the customer behind a console chat:
// GET /api/advisor/conversations/:id/customer-context (back PR #48). Values
// come as the warehouse stores them (English enums, anything may be null);
// transcripts arrive already masked.

import { format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export interface ContextCustomer {
  customerId: string | null;
  firstName: string | null;
  lastName: string | null;
}

// bank_gold.interaction_history.
export interface Interaction {
  interactionId: string | null;
  // The bank has a call transcript for this interaction.
  hasTranscript: boolean;
  date: string | null;
  interactionType: string | null;
  channel: string | null;
  reason: string | null;
  resolved: boolean | null;
  escalated: boolean | null;
  sentiment: string | null;
}

// bank_silver.call_transcripts.
export interface Transcript {
  // The interaction this transcript belongs to.
  interactionId: string | null;
  date: string | null;
  customerText: string | null;
  agentText: string | null;
  language: string | null;
  intents: string[];
  topics: string[];
}

export interface BankCase {
  type: string | null;
  category: string | null;
  date: string | null;
  claimedAmount: number | null;
  currency: string | null;
  priority: string | null;
  status: string | null;
  resolution: string | null;
}

export interface CustomerContext {
  customer: ContextCustomer | null;
  interactions: Interaction[];
  transcripts: Transcript[];
  cases: BankCase[];
}

export type ContextTab = 'cases' | 'interactions' | 'transcripts';

export function customerContextUrl(chatId: string): string {
  return `/api/advisor/conversations/${chatId}/customer-context`;
}

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
const bool = (value: unknown) => (typeof value === 'boolean' ? value : null);
const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
// A list as the warehouse stores it: an array, or one string (kept as is).
const strings = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(str).filter((v): v is string => v !== null);
  const one = str(value);
  return one ? [one] : [];
};
const list = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter(
    (item): item is Record<string, unknown> => !!item && typeof item === 'object',
  );

// The one place that knows the response shape.
export function parseCustomerContext(body: unknown): CustomerContext {
  const raw = (body ?? {}) as Record<string, unknown>;
  const customer =
    raw.customer && typeof raw.customer === 'object'
      ? (raw.customer as Record<string, unknown>)
      : null;
  return {
    customer: customer
      ? {
          customerId: str(customer.customerId),
          firstName: str(customer.firstName),
          lastName: str(customer.lastName),
        }
      : null,
    interactions: list(raw.interactions).map((i) => ({
      interactionId: str(i.interactionId),
      hasTranscript: i.hasTranscript === true,
      date: str(i.date),
      interactionType: str(i.interactionType),
      channel: str(i.channel),
      reason: str(i.reason),
      resolved: bool(i.resolved),
      escalated: bool(i.escalated),
      sentiment: str(i.sentiment),
    })),
    transcripts: list(raw.transcripts).map((t) => ({
      interactionId: str(t.interactionId),
      date: str(t.date),
      customerText: str(t.customerText),
      agentText: str(t.agentText),
      language: str(t.language),
      intents: strings(t.intents),
      topics: strings(t.topics),
    })),
    cases: list(raw.cases).map((c) => ({
      type: str(c.type),
      category: str(c.category),
      date: str(c.date),
      claimedAmount: num(c.claimedAmount),
      currency: str(c.currency),
      priority: str(c.priority),
      status: str(c.status),
      resolution: str(c.resolution),
    })),
  };
}

export class CustomerContextError extends Error {
  constructor(public status: number) {
    super(`Customer context responded ${status}`);
  }
}

// null: the chat has no bank customer (204), e.g. chats from before the demo
// customer was sent.
export async function fetchCustomerContext(url: string): Promise<CustomerContext | null> {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 204) return null;
  if (!res.ok) throw new CustomerContextError(res.status);
  return parseCustomerContext(await res.json());
}

// The transcript of an interaction, when the bank has it and sent it.
export function transcriptFor(
  context: CustomerContext,
  interaction: Interaction,
): Transcript | null {
  if (!interaction.hasTranscript || !interaction.interactionId) return null;
  return context.transcripts.find((t) => t.interactionId === interaction.interactionId) ?? null;
}

// The tab to open first: the first one with something in it.
export function firstTab(context: CustomerContext): ContextTab {
  if (context.cases.length) return 'cases';
  if (context.interactions.length) return 'interactions';
  if (context.transcripts.length) return 'transcripts';
  return 'cases';
}

// Warehouse values translated one to one; unknown values stay as they come.
const INTERACTION_TYPE: Record<string, string> = {
  'inbound call': 'Llamada entrante: llamó el cliente',
  'outbound call': 'Llamada saliente: llamó el banco',
  video: 'Videollamada',
  'video call': 'Videollamada',
  chat: 'Chat',
  email: 'Correo',
  'branch visit': 'Visita a sucursal',
};
const CHANNEL: Record<string, string> = {
  phone: 'Teléfono',
  web: 'Web',
  chat: 'Chat',
  app: 'App',
  mobile: 'App móvil',
  'mobile app': 'App móvil',
  email: 'Correo',
  branch: 'Sucursal',
  video: 'Video',
};
const LANGUAGE: Record<string, string> = {
  es: 'Español',
  spanish: 'Español',
  en: 'Inglés',
  english: 'Inglés',
  pt: 'Portugués',
  portuguese: 'Portugués',
};
const SENTIMENT: Record<string, string> = {
  positive: 'Positivo',
  neutral: 'Neutral',
  negative: 'Negativo',
};
const PRIORITY: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
const STATUS: Record<string, { label: string; tone: CaseTone }> = {
  open: { label: 'Abierto', tone: 'open' },
  'in progress': { label: 'En proceso', tone: 'open' },
  pending: { label: 'Pendiente', tone: 'open' },
  escalated: { label: 'Escalado', tone: 'open' },
  closed: { label: 'Cerrado', tone: 'closed' },
  resolved: { label: 'Resuelto', tone: 'closed' },
  rejected: { label: 'Rechazado', tone: 'closed' },
};

export type CaseTone = 'open' | 'closed' | 'other';

const key = (value: string | null) => value?.trim().toLowerCase().replace(/[_-]+/g, ' ') ?? '';

export function interactionTypeLabel(type: string | null): string | null {
  return type ? (INTERACTION_TYPE[key(type)] ?? type) : null;
}

export function channelLabel(channel: string | null): string | null {
  return channel ? (CHANNEL[key(channel)] ?? channel) : null;
}

export function languageLabel(language: string | null): string | null {
  return language ? (LANGUAGE[key(language)] ?? language) : null;
}

// "Sí" / "No"; nothing when the field isn't recorded.
export function yesNo(value: boolean | null): string | null {
  return value === null ? null : value ? 'Sí' : 'No';
}

export function sentimentLabel(sentiment: string | null): string | null {
  return sentiment ? (SENTIMENT[key(sentiment)] ?? sentiment) : null;
}

export function priorityLabel(priority: string | null): string | null {
  return priority ? (PRIORITY[key(priority)] ?? priority) : null;
}

export function caseStatus(status: string | null): { label: string; tone: CaseTone } {
  if (!status) return { label: 'Sin estado', tone: 'other' };
  return STATUS[key(status)] ?? { label: status, tone: 'other' };
}

// "26 sep 2026"; ISO timestamps and plain YYYY-MM-DD both work.
export function formatContextDate(date: string | null): string | null {
  if (!date) return null;
  const parsed = parseISO(date);
  return isValid(parsed) ? format(parsed, 'd MMM yyyy', { locale: es }) : date;
}

export function formatClaim(amount: number | null, currency: string | null): string | null {
  if (amount === null) return null;
  try {
    return new Intl.NumberFormat('es', {
      style: 'currency',
      currency: currency ?? 'USD',
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('es')} ${currency ?? ''}`.trim();
  }
}
