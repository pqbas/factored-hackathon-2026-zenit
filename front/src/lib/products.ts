import type {
  MockProduct,
  MockTransaction,
  ProductStatus,
  ProductType,
} from '@/mocks/products';

export type ProductGroup = 'accounts' | 'cards' | 'loans' | 'investments';

export const PRODUCT_GROUPS: { id: ProductGroup; label: string }[] = [
  { id: 'accounts', label: 'Cuentas' },
  { id: 'cards', label: 'Tarjetas' },
  { id: 'loans', label: 'Créditos' },
  { id: 'investments', label: 'Inversiones' },
];

const TYPE_INFO: Record<ProductType, { label: string; group: ProductGroup }> = {
  'Checking Account': { label: 'Cuenta corriente', group: 'accounts' },
  'Savings Account': { label: 'Cuenta de ahorro', group: 'accounts' },
  'Debit Card': { label: 'Tarjeta de débito', group: 'cards' },
  'Credit Card': { label: 'Tarjeta de crédito', group: 'cards' },
  'Personal Loan': { label: 'Préstamo personal', group: 'loans' },
  Mortgage: { label: 'Crédito hipotecario', group: 'loans' },
  Investment: { label: 'Inversión a plazo', group: 'investments' },
};

const STATUS_LABEL: Record<ProductStatus, string> = {
  Active: 'Activo',
  Blocked: 'Bloqueado',
  Suspended: 'Suspendido',
  Closed: 'Cerrado',
};

export function productLabel(type: ProductType): string {
  return TYPE_INFO[type].label;
}

export function productGroup(type: ProductType): ProductGroup {
  return TYPE_INFO[type].group;
}

export function statusLabel(status: ProductStatus): string {
  return STATUS_LABEL[status];
}

// "0123456789014821" -> "•• 4821"
export function maskNumber(productNumber: string): string {
  return `•• ${productNumber.slice(-4)}`;
}

const CURRENCY_LOCALE: Record<string, string> = {
  ARS: 'es-AR',
  COP: 'es-CO',
  MXN: 'es-MX',
  USD: 'es-US',
};

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? 'es', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function groupProducts(
  products: MockProduct[],
): { id: ProductGroup; label: string; products: MockProduct[] }[] {
  return PRODUCT_GROUPS.map((group) => ({
    ...group,
    products: products.filter(
      (product) => productGroup(product.productType) === group.id,
    ),
  })).filter((group) => group.products.length > 0);
}

// Credit and loan balances are money owed; the rest is money the customer has.
export function isDebt(type: ProductType): boolean {
  const group = productGroup(type);
  return group === 'loans' || type === 'Credit Card';
}

export interface ProductTotals {
  available: number;
  debt: number;
  invested: number;
}

export function summarizeProducts(products: MockProduct[]): ProductTotals {
  const open = products.filter((p) => p.productStatus !== 'Closed');
  const sum = (items: MockProduct[]) =>
    items.reduce((total, p) => total + p.currentBalance, 0);
  return {
    // Debit cards draw on the checking account, so they are not added again.
    available: sum(open.filter((p) => productGroup(p.productType) === 'accounts')),
    debt: sum(open.filter((p) => isDebt(p.productType))),
    invested: sum(open.filter((p) => productGroup(p.productType) === 'investments')),
  };
}

export function creditUsage(product: MockProduct): number | null {
  if (product.productType !== 'Credit Card' || !product.creditLimit) return null;
  return Math.min(1, product.currentBalance / product.creditLimit);
}

export function transactionsFor(
  transactions: MockTransaction[],
  productId?: string,
): MockTransaction[] {
  return transactions
    .filter((tx) => !productId || tx.productId === productId)
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
}

const TX_TYPE_LABEL: Record<MockTransaction['transactionType'], string> = {
  Purchase: 'Compra',
  Transfer: 'Transferencia',
  Deposit: 'Depósito',
  Withdrawal: 'Retiro',
  Payment: 'Pago',
  Adjustment: 'Ajuste',
};

export function transactionLabel(tx: MockTransaction): string {
  return tx.merchantName ?? TX_TYPE_LABEL[tx.transactionType];
}

// Deposits and adjustments add money; every other type takes it out.
export function signedAmount(tx: MockTransaction): number {
  const incoming =
    tx.transactionType === 'Deposit' || tx.transactionType === 'Adjustment';
  return incoming ? tx.amount : -tx.amount;
}

const TX_STATUS_LABEL: Record<string, string> = {
  Pending: 'Pendiente',
  Declined: 'Rechazada',
  Reversed: 'Revertida',
};

// null for approved movements, which need no badge.
export function transactionStatusLabel(status: string): string | null {
  return TX_STATUS_LABEL[status] ?? null;
}

// Dataset values are local: "2026-06-14 15:47:29" or a bare "2026-06-14".
// A bare date would parse as UTC midnight and show the previous day.
export function parseDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  return new Date(value.replace(' ', 'T'));
}

export function transactionTypeLabel(
  type: MockTransaction['transactionType'],
): string {
  return TX_TYPE_LABEL[type];
}
