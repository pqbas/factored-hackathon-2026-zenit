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
}: {
  customer: ProductsCustomer;
  products: Product[];
  transactions: Transaction[];
}) {
  const totals = summarizeProducts(products);
  const money = (amount: number) => formatMoney(amount, totals.currency);
  const hasSavings = products.some((p) => productKind(p) === 'savings');
  const hasCards = products.some((p) => productKind(p) === 'credit');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 md:px-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-3xl tracking-tight">Hola, {customer.firstName}</h1>
        <p className="text-muted-foreground">
          {products.length} {products.length === 1 ? 'producto activo' : 'productos activos'}
        </p>
      </div>

      {/* Only the tiles that apply to what the customer has. */}
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        {hasSavings && (
          <StatTile label="Disponible en cuentas" value={money(totals.available)} />
        )}
        {hasCards && (
          <>
            <StatTile label="Por pagar" value={money(totals.debt)} hint="Saldo de tus tarjetas" />
            <StatTile
              label="Cupo disponible"
              value={money(totals.creditAvailable)}
              hint="En tus tarjetas"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col gap-2">
          <h2 className="px-1 font-semibold text-[15px]">Últimos movimientos</h2>
          <div className="rounded-[14px] bg-card p-1.5">
            <TransactionList transactions={transactions} showProduct />
          </div>
        </section>

        <section className="flex flex-col gap-2" data-testid="customer-profile">
          <h2 className="px-1 font-semibold text-[15px]">Mis datos</h2>
          <div className="divide-y divide-border rounded-[14px] bg-card px-4 py-1">
            <DetailRow label="Nombre" value={`${customer.firstName} ${customer.lastName}`} />
            <DetailRow label="Cliente" value={customer.customerId} />
          </div>
        </section>
      </div>
    </div>
  );
}
