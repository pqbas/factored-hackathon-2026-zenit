// "Mis productos" from GET /api/products?sessionToken=<demo customer token>:
// the customer, their active products and their 10 latest movements, from the
// bank's warehouse (the same UC functions the agent uses).

import { paletteIndex } from '@/lib/conversations';
import { intlLocale, tr } from '@/lib/i18n';

export interface ProductsCustomer {
  customerId: string;
  firstName: string;
  lastName: string;
}

export interface Product {
  productType: string; // 'Tarjeta Crédito' | 'Cuenta Ahorro' today
  last4: string;
  currency: string;
  currentBalance: number;
  creditLimit: number | null;
  availableCredit: number | null; // null for savings
}

export interface Transaction {
  date: string; // ISO
  productType: string;
  last4: string;
  type: string; // e.g. 'Purchase'
  merchant: string | null;
  amount: number;
  currency: string;
  status: string; // e.g. 'Approved'
}

export interface ProductsData {
  customer: ProductsCustomer;
  products: Product[];
  transactions: Transaction[];
}

export type ProductsError = 'no-customer' | 'expired' | 'invalid' | 'failed';

export class ProductsRequestError extends Error {
  constructor(public kind: ProductsError) {
    super(kind);
  }
}

export async function fetchProducts(sessionToken: string): Promise<ProductsData> {
  const res = await fetch(
    `/api/products?sessionToken=${encodeURIComponent(sessionToken)}`,
    { credentials: 'include' },
  );
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    throw new ProductsRequestError(body.reason === 'expired' ? 'expired' : 'invalid');
  }
  if (!res.ok) throw new ProductsRequestError('failed');
  return res.json();
}

export type ProductKind = 'credit' | 'savings' | 'other';

// A credit product has a limit; savings have neither limit nor available credit.
export function productKind(product: Product): ProductKind {
  if (product.creditLimit !== null || /cr[eé]dito/i.test(product.productType)) return 'credit';
  if (/ahorro|cuenta/i.test(product.productType)) return 'savings';
  return 'other';
}

export function productId(product: { productType: string; last4: string }): string {
  return `${product.productType}-${product.last4}`;
}

export function productName(product: { productType: string; last4: string }): string {
  return `${product.productType} •• ${product.last4}`;
}

export const PRODUCT_GROUPS: { kind: ProductKind; label: string }[] = [
  { kind: 'savings', get label() { return tr().products.groups.savings; } },
  { kind: 'credit', get label() { return tr().products.groups.credit; } },
  { kind: 'other', get label() { return tr().products.groups.other; } },
];

export function groupProducts(
  products: Product[],
): { kind: ProductKind; label: string; products: Product[] }[] {
  return PRODUCT_GROUPS.map((group) => ({
    kind: group.kind,
    label: group.label,
    products: products.filter((p) => productKind(p) === group.kind),
  })).filter((group) => group.products.length > 0);
}

const CURRENCY_LOCALE: Record<string, string> = {
  ARS: 'es-AR',
  COP: 'es-CO',
  MXN: 'es-MX',
  USD: 'es-US',
};

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? intlLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export interface ProductTotals {
  currency: string;
  // Money in savings accounts.
  available: number;
  // What the cards owe.
  debt: number;
  // Credit still available on the cards.
  creditAvailable: number;
}

// Totals in the first product's currency; products in other currencies are
// left out of the sums (mixed currencies: fuera de alcance / futuro).
export function summarizeProducts(products: Product[]): ProductTotals {
  const currency = products[0]?.currency ?? 'USD';
  const same = products.filter((p) => p.currency === currency);
  const sum = (items: Product[], pick: (p: Product) => number) =>
    items.reduce((total, p) => total + pick(p), 0);
  return {
    currency,
    available: sum(same.filter((p) => productKind(p) === 'savings'), (p) => p.currentBalance),
    debt: sum(same.filter((p) => productKind(p) === 'credit'), (p) => p.currentBalance),
    creditAvailable: sum(same, (p) => p.availableCredit ?? 0),
  };
}

// Share of the credit limit in use, 0..1; null without a limit.
export function creditUsage(product: Product): number | null {
  if (!product.creditLimit) return null;
  return Math.min(1, Math.max(0, product.currentBalance / product.creditLimit));
}

export function transactionsFor(transactions: Transaction[], product?: Product): Transaction[] {
  return transactions.filter(
    (tx) => !product || (tx.productType === product.productType && tx.last4 === product.last4),
  );
}

// Money coming in: deposits, payments to a card, refunds and adjustments.
const INCOMING = new Set(['Deposit', 'Payment', 'Refund', 'Adjustment', 'Credit']);

export function signedAmount(tx: Transaction): number {
  const amount = Math.abs(tx.amount);
  return INCOMING.has(tx.type) ? amount : -amount;
}

export function transactionTypeLabel(type: string): string {
  return tr().products.txTypes[type] ?? type;
}

export function transactionLabel(tx: Transaction): string {
  return tx.merchant || transactionTypeLabel(tx.type);
}

// null for approved movements, which need no badge.
export function transactionStatusLabel(status: string): string | null {
  return tr().products.txStatuses[status] ?? null;
}

// Each card's color, stable, like the avatars: the same hues, deeper, on a
// diagonal gradient so the white text reads well.
const CARD_COLORS = [
  'bg-linear-135 from-rose-500 to-rose-800',
  'bg-linear-135 from-orange-500 to-orange-800',
  'bg-linear-135 from-amber-600 to-amber-800',
  'bg-linear-135 from-emerald-600 to-emerald-900',
  'bg-linear-135 from-teal-600 to-teal-900',
  'bg-linear-135 from-sky-600 to-sky-900',
  'bg-linear-135 from-indigo-500 to-indigo-800',
  'bg-linear-135 from-violet-500 to-violet-800',
];

export function cardColor(product: { productType: string; last4: string }): string {
  return CARD_COLORS[paletteIndex(productId(product), CARD_COLORS.length)];
}

// Only the last 4 digits exist in the data: the rest is always masked.
export function maskedCardNumber(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

// What the card's actions send to David, in the current language.
export function cardChatPrompt(action: 'movements' | 'claim', product: { last4: string }): string {
  const t = tr().products;
  return action === 'movements' ? t.movementsPrompt(product.last4) : t.claimPrompt(product.last4);
}
