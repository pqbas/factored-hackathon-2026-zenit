// The bank's history of the customer behind a console chat:
// GET /api/advisor/conversations/:id/customer-context (back PR #48). Values
// come as the warehouse stores them (English enums, anything may be null);
// transcripts arrive already masked.

import { format, isValid, parseISO } from 'date-fns';

import { dateLocale, intlLocale, tr } from '@/lib/i18n';

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

// The customer's main data as the bank has it (bank_gold.customer_360 and
// the active products). Any field may be null; null profile = no section.
export interface CustomerProfile {
  customerId: string | null;
  country: string | null;
  city: string | null;
  segment: string | null;
  status: string | null;
  customerSince: string | null;
  products: { productType: string | null; last4: string | null }[];
  contact: { email: string | null; mobilePhone: string | null };
  preferredChannel: string | null;
}

export interface CustomerContext {
  customer: ContextCustomer | null;
  profile: CustomerProfile | null;
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
    profile: parseProfile(raw.profile),
  };
}

function parseProfile(value: unknown): CustomerProfile | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  const contact = (p.contact && typeof p.contact === 'object' ? p.contact : {}) as Record<string, unknown>;
  return {
    customerId: str(p.customerId),
    country: str(p.country),
    city: str(p.city),
    segment: str(p.segment),
    status: str(p.status),
    customerSince: str(p.customerSince),
    products: list(p.products)
      .map((item) => ({ productType: str(item.productType), last4: str(item.last4) }))
      .filter((item) => item.productType || item.last4),
    contact: { email: str(contact.email), mobilePhone: str(contact.mobilePhone) },
    preferredChannel: str(p.preferredChannel),
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

// Warehouse values translated one to one (the words live in i18n.ts); unknown
// values stay as they come.
const STATUS_TONE: Record<string, CaseTone> = {
  open: 'open',
  'in progress': 'open',
  pending: 'open',
  escalated: 'open',
  closed: 'closed',
  resolved: 'closed',
  rejected: 'closed',
};

export type CaseTone = 'open' | 'closed' | 'other';

const key = (value: string | null) => value?.trim().toLowerCase().replace(/[_-]+/g, ' ') ?? '';

// The channel as the warehouse names it, for picking its icon.
export const channelKey = key;

export function interactionTypeLabel(type: string | null): string | null {
  return type ? (tr().console.ctx.interactionTypes[key(type)] ?? type) : null;
}

export function channelLabel(channel: string | null): string | null {
  return channel ? (tr().console.ctx.channels[key(channel)] ?? channel) : null;
}

export function languageLabel(language: string | null): string | null {
  return language ? (tr().console.ctx.languages[key(language)] ?? language) : null;
}

// "Sí" / "No"; nothing when the field isn't recorded.
export function yesNo(value: boolean | null): string | null {
  return value === null ? null : value ? tr().console.ctx.yes : tr().console.ctx.no;
}

export function sentimentLabel(sentiment: string | null): string | null {
  return sentiment ? (tr().console.ctx.sentiments[key(sentiment)] ?? sentiment) : null;
}

export function priorityLabel(priority: string | null): string | null {
  return priority ? (tr().console.ctx.priorities[key(priority)] ?? priority) : null;
}

export function caseStatus(status: string | null): { label: string; tone: CaseTone } {
  if (!status) return { label: tr().console.ctx.noStatus, tone: 'other' };
  const id = key(status);
  const label = tr().console.ctx.caseStatuses[id];
  return label ? { label, tone: STATUS_TONE[id] ?? 'other' } : { label: status, tone: 'other' };
}

// "26 sep 2026"; ISO timestamps and plain YYYY-MM-DD both work.
export function formatContextDate(date: string | null): string | null {
  if (!date) return null;
  const parsed = parseISO(date);
  return isValid(parsed) ? format(parsed, 'd MMM yyyy', { locale: dateLocale() }) : date;
}

export function formatClaim(amount: number | null, currency: string | null): string | null {
  if (amount === null) return null;
  try {
    return new Intl.NumberFormat(intlLocale(), {
      style: 'currency',
      currency: currency ?? 'USD',
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(intlLocale())} ${currency ?? ''}`.trim();
  }
}

export function customerStatusLabel(status: string | null): string | null {
  return status ? (tr().console.ctx.customerStatuses[key(status)] ?? status) : null;
}

export interface ProfileField {
  key: string;
  label: string;
  // One line per value (products list one each).
  values: string[];
}

// "Datos del cliente" as a record, in the order the advisor reads it. The
// customer id is left out: it's already masked in the chat header.
export function profileFields(profile: CustomerProfile | null): ProfileField[] {
  if (!profile) return [];
  const products = profile.products.map((p) =>
    [p.productType, p.last4 && `••${p.last4}`].filter(Boolean).join(' '),
  );
  const labels = tr().console.ctx.profile;
  const rows: [string, string, (string | null)[]][] = [
    ['location', labels.location, [[profile.city, profile.country].filter(Boolean).join(', ') || null]],
    ['segment', labels.segment, [profile.segment]],
    ['status', labels.status, [customerStatusLabel(profile.status)]],
    ['customerSince', labels.customerSince, [formatContextDate(profile.customerSince)]],
    ['products', labels.products, products],
    ['email', labels.email, [profile.contact.email]],
    ['mobilePhone', labels.mobilePhone, [profile.contact.mobilePhone]],
    ['preferredChannel', labels.preferredChannel, [channelLabel(profile.preferredChannel)]],
  ];
  return rows
    .map(([key, label, values]) => ({ key, label, values: values.filter((v): v is string => !!v) }))
    .filter((row) => row.values.length > 0);
}
