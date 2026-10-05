import { useLang } from '@/contexts/LangContext';
import { ProductIcon } from '@/components/products/product-icon';
import { DetailRow } from '@/components/products/stat-tile';
import { TransactionList } from '@/components/products/transaction-list';
import {
  creditUsage,
  formatMoney,
  type Product,
  productKind,
  type Transaction,
  transactionsFor,
} from '@/lib/products';

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
  product: Product;
  transactions: Transaction[];
}) {
  const { t } = useLang();
  const kind = productKind(product);
  const usage = creditUsage(product);
  const money = (amount: number) => formatMoney(amount, product.currency);
  const movements = transactionsFor(transactions, product);

  return (
    <div
      data-testid="product-detail"
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-8 md:px-10"
    >
      <div className="flex items-center gap-3">
        <ProductIcon kind={kind} className="size-11 rounded-xl" />
        <div className="flex flex-col">
          <h1 className="font-semibold text-xl tracking-tight">{product.productType}</h1>
          <span className="text-muted-foreground text-sm">
            •• {product.last4} · {product.currency}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] bg-card px-5 py-5">
        <span className="text-muted-foreground text-sm">
          {kind === 'credit' ? t.products.balanceUsed : t.products.balanceAvailable}
        </span>
        <span className="font-semibold text-4xl tabular-nums tracking-tight">
          {money(product.currentBalance)}
        </span>
        {usage !== null && product.creditLimit !== null && (
          <div className="flex flex-col gap-1.5">
            <ProgressBar value={usage} label={t.products.limitUsage} />
            <span className="text-muted-foreground text-xs">
              {t.products.usage(Math.round(usage * 100), money(product.creditLimit))}
              {product.availableCredit !== null &&
                t.products.availableSuffix(money(product.availableCredit))}
            </span>
          </div>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-semibold text-[15px]">{t.products.details}</h2>
        <div className="divide-y divide-border rounded-[14px] bg-card px-4 py-1">
          <DetailRow label={t.products.number} value={`•• ${product.last4}`} />
          <DetailRow label={t.products.currency} value={product.currency} />
          {product.creditLimit !== null && (
            <DetailRow label={t.products.creditLimit} value={money(product.creditLimit)} />
          )}
          {product.availableCredit !== null && (
            <DetailRow label={t.products.availableCredit} value={money(product.availableCredit)} />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-semibold text-[15px]">{t.products.recentMovements}</h2>
        <div className="rounded-[14px] bg-card p-1.5">
          <TransactionList transactions={movements} />
        </div>
      </section>
    </div>
  );
}
