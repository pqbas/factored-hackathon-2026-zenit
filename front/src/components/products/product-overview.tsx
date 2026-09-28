import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { DetailRow, StatTile } from '@/components/products/stat-tile';
import { TransactionList } from '@/components/products/transaction-list';
import {
  formatMoney,
  maskNumber,
  parseDate,
  productLabel,
  summarizeProducts,
  transactionsFor,
} from '@/lib/products';
import type {
  MockCustomer,
  MockProduct,
  MockTransaction,
} from '@/mocks/products';

export function ProductOverview({
  customer,
  products,
  transactions,
}: {
  customer: MockCustomer;
  products: MockProduct[];
  transactions: MockTransaction[];
}) {
  const currency = products[0]?.currency ?? 'USD';
  const totals = summarizeProducts(products);
  const productNames = Object.fromEntries(
    products.map((p) => [
      p.productId,
      `${productLabel(p.productType)} ${maskNumber(p.productNumber)}`,
    ]),
  );
  const since = format(parseDate(customer.registrationDate), 'yyyy');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 md:px-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-3xl tracking-tight">
          Hola, {customer.firstName}
        </h1>
        <p className="text-muted-foreground">
          Cliente {customer.segment} desde {since} · {products.length}{' '}
          productos
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Disponible en cuentas"
          value={formatMoney(totals.available, currency)}
        />
        <StatTile
          label="Por pagar"
          value={formatMoney(totals.debt, currency)}
          hint="Tarjetas y créditos"
        />
        <StatTile
          label="Invertido"
          value={formatMoney(totals.invested, currency)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col gap-2">
          <h2 className="px-1 font-semibold text-[15px]">Últimos movimientos</h2>
          <div className="rounded-[14px] bg-card p-1.5">
            <TransactionList
              transactions={transactionsFor(transactions).slice(0, 8)}
              productNames={productNames}
            />
          </div>
        </section>

        <section className="flex flex-col gap-2" data-testid="customer-profile">
          <h2 className="px-1 font-semibold text-[15px]">Mis datos</h2>
          <div className="divide-y divide-border rounded-[14px] bg-card px-4 py-1">
            <DetailRow
              label="Nombre"
              value={`${customer.firstName} ${customer.lastName}`}
            />
            <DetailRow
              label="Documento"
              value={`${customer.documentType} ${maskNumber(customer.documentNumber)}`}
            />
            <DetailRow label="Correo" value={customer.email} />
            {customer.mobilePhone && (
              <DetailRow label="Celular" value={customer.mobilePhone} />
            )}
            {customer.city && (
              <DetailRow
                label="Ciudad"
                value={`${customer.city}, ${customer.country}`}
              />
            )}
            <DetailRow label="Segmento" value={customer.segment} />
            {customer.creditScore !== null && (
              <DetailRow
                label="Puntaje crediticio"
                value={String(Math.round(customer.creditScore))}
              />
            )}
            {customer.estimatedMonthlyIncome !== null && (
              <DetailRow
                label="Ingreso mensual estimado"
                value={formatMoney(customer.estimatedMonthlyIncome, currency)}
              />
            )}
            <DetailRow
              label="Cliente desde"
              value={format(parseDate(customer.registrationDate), "d 'de' MMMM yyyy", {
                locale: es,
              })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
