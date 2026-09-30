import { useLang } from '@/contexts/LangContext';
import { CardCarousel } from '@/components/products/card-carousel';
import { SavingsChart } from '@/components/products/savings-chart';
import { DetailRow, StatTile } from '@/components/products/stat-tile';
import { TransactionList } from '@/components/products/transaction-list';
import {
  formatMoney,
  type Product,
  productKind,
  type ProductsCustomer,
  summarizeProducts,
  type Transaction,
} from '@/lib/products';

export function ProductOverview({
  customer,
  products,
  transactions,
  sessionToken,
}: {
  customer: ProductsCustomer;
  products: Product[];
  transactions: Transaction[];
  // The demo customer's token, for the savings history.
  sessionToken: string;
}) {
  const { t } = useLang();
  const totals = summarizeProducts(products);
  const money = (amount: number) => formatMoney(amount, totals.currency);
  const hasSavings = products.some((p) => productKind(p) === 'savings');
  const cards = products.filter((p) => productKind(p) === 'credit');
  const hasCards = cards.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 md:px-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-3xl tracking-tight">{t.products.hello(customer.firstName)}</h1>
        <p className="text-muted-foreground">
          {products.length} {products.length === 1 ? t.products.activeProduct : t.products.activeProducts}
        </p>
      </div>

      {/* Only the tiles that apply to what the customer has. */}
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        {hasSavings && (
          <StatTile label={t.products.availableInAccounts} value={money(totals.available)} />
        )}
        {hasCards && (
          <>
            <StatTile label={t.products.toPay} value={money(totals.debt)} hint={t.products.cardsBalance} />
            <StatTile
              label={t.products.availableCredit}
              value={money(totals.creditAvailable)}
              hint={t.products.inYourCards}
            />
          </>
        )}
      </div>

      {hasSavings && <SavingsChart sessionToken={sessionToken} products={products} />}

      {hasCards && <CardCarousel cards={cards} transactions={transactions} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section data-testid="overview-movements" className="flex flex-col gap-2">
          <h2 className="px-1 font-semibold text-[15px]">{t.products.lastMovements}</h2>
          <div className="rounded-[14px] bg-card p-1.5">
            <TransactionList transactions={transactions} showProduct />
          </div>
        </section>

        <section className="flex flex-col gap-2" data-testid="customer-profile">
          <h2 className="px-1 font-semibold text-[15px]">{t.products.myData}</h2>
          <div className="divide-y divide-border rounded-[14px] bg-card px-4 py-1">
            <DetailRow label={t.products.name} value={`${customer.firstName} ${customer.lastName}`} />
            <DetailRow label={t.products.customer} value={customer.customerId} />
          </div>
        </section>
      </div>
    </div>
  );
}
