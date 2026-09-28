import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle } from 'lucide-react';

import { ProductIcon } from '@/components/products/product-icon';
import { DetailRow } from '@/components/products/stat-tile';
import { TransactionList } from '@/components/products/transaction-list';
import {
  creditUsage,
  formatMoney,
  maskNumber,
  parseDate,
  productGroup,
  productLabel,
  statusLabel,
  transactionsFor,
} from '@/lib/products';
import { cn } from '@/lib/utils';
import type { MockProduct, MockTransaction } from '@/mocks/products';

const CHANNEL_LABEL: Record<string, string> = {
  Branch: 'Sucursal',
  'Call Center': 'Centro de atención',
  'Mobile App': 'App',
  Web: 'Web',
};

function balanceCaption(product: MockProduct): string {
  switch (productGroup(product.productType)) {
    case 'accounts':
      return 'Saldo disponible';
    case 'cards':
      return product.productType === 'Credit Card'
        ? 'Saldo utilizado'
        : 'Saldo de la cuenta asociada';
    case 'loans':
      return 'Saldo pendiente';
    default:
      return 'Valor actual';
  }
}

function formatDay(value: string): string {
  return format(parseDate(value), "d 'de' MMMM yyyy", { locale: es });
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <progress
      value={Math.round(value * 100)}
      max={100}
      aria-label={label}
      className="h-1.5 w-full appearance-none overflow-hidden rounded-full bg-secondary [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
    />
  );
}

export function ProductDetail({
  product,
  transactions,
}: {
  product: MockProduct;
  transactions: MockTransaction[];
}) {
  const usage = creditUsage(product);
  const isLoan = productGroup(product.productType) === 'loans';
  const paid =
    isLoan && product.creditLimit
      ? Math.max(0, 1 - product.currentBalance / product.creditLimit)
      : null;
  const movements = transactionsFor(transactions, product.productId);

  return (
    <div
      data-testid="product-detail"
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-8 md:px-10"
    >
      <div className="flex items-center gap-3">
        <ProductIcon type={product.productType} className="size-11 rounded-xl" />
        <div className="flex flex-col">
          <h1 className="font-semibold text-xl tracking-tight">
            {productLabel(product.productType)}
          </h1>
          <span className="text-muted-foreground text-sm">
            {maskNumber(product.productNumber)} · {product.currency}
          </span>
        </div>
        <span
          className={cn(
            'ml-auto rounded-full px-2.5 py-1 font-medium text-xs',
            product.productStatus === 'Active'
              ? 'bg-tint-green text-tint-green-foreground'
              : 'bg-tint-red text-tint-red-foreground',
          )}
        >
          {statusLabel(product.productStatus)}
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] bg-card px-5 py-5">
        <span className="text-muted-foreground text-sm">
          {balanceCaption(product)}
        </span>
        <span className="font-semibold text-4xl tabular-nums tracking-tight">
          {formatMoney(product.currentBalance, product.currency)}
        </span>
        {usage !== null && product.creditLimit && (
          <div className="flex flex-col gap-1.5">
            <ProgressBar value={usage} label="Uso del límite" />
            <span className="text-muted-foreground text-xs">
              Usas el {Math.round(usage * 100)}% de tu límite de{' '}
              {formatMoney(product.creditLimit, product.currency)} · Disponible{' '}
              {formatMoney(
                product.creditLimit - product.currentBalance,
                product.currency,
              )}
            </span>
          </div>
        )}
        {paid !== null && product.creditLimit && (
          <div className="flex flex-col gap-1.5">
            <ProgressBar value={paid} label="Avance del pago" />
            <span className="text-muted-foreground text-xs">
              Pagaste el {Math.round(paid * 100)}% de{' '}
              {formatMoney(product.creditLimit, product.currency)}
            </span>
          </div>
        )}
        {!!product.daysPastDue && product.daysPastDue > 0 && (
          <span className="flex items-center gap-2 rounded-[10px] bg-tint-red px-3 py-2 text-sm text-tint-red-foreground">
            <AlertTriangle className="size-4" strokeWidth={1.8} />
            Tienes {product.daysPastDue}{' '}
            {product.daysPastDue === 1 ? 'día' : 'días'} de atraso en el pago.
          </span>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-semibold text-[15px]">Detalles</h2>
        <div className="divide-y divide-border rounded-[14px] bg-card px-4 py-1">
          <DetailRow label="Número" value={maskNumber(product.productNumber)} />
          {product.interestRate !== null && (
            <DetailRow
              label={isLoan || usage !== null ? 'Tasa de interés' : 'Rendimiento anual'}
              value={`${product.interestRate.toFixed(2)}%`}
            />
          )}
          {product.creditLimit !== null && (
            <DetailRow
              label={isLoan ? 'Monto otorgado' : 'Límite de crédito'}
              value={formatMoney(product.creditLimit, product.currency)}
            />
          )}
          <DetailRow label="Apertura" value={formatDay(product.openingDate)} />
          {product.expirationDate && (
            <DetailRow
              label="Vencimiento"
              value={formatDay(product.expirationDate)}
            />
          )}
          <DetailRow
            label="Abierto por"
            value={CHANNEL_LABEL[product.openingChannel] ?? product.openingChannel}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-semibold text-[15px]">Movimientos</h2>
        <div className="rounded-[14px] bg-card p-1.5">
          <TransactionList transactions={movements} />
        </div>
      </section>
    </div>
  );
}
