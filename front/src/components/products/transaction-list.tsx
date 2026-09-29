import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

import {
  formatMoney,
  productName,
  signedAmount,
  type Transaction,
  transactionLabel,
  transactionStatusLabel,
  transactionTypeLabel,
} from '@/lib/products';
import { cn } from '@/lib/utils';

function formatTxDate(value: string): string {
  const date = new Date(value);
  const time = format(date, 'HH:mm');
  if (isToday(date)) return `Hoy, ${time}`;
  if (isYesterday(date)) return `Ayer, ${time}`;
  return format(date, 'd MMM yyyy, HH:mm', { locale: es });
}

export function TransactionList({
  transactions,
  showProduct = false,
}: {
  transactions: Transaction[];
  showProduct?: boolean;
}) {
  if (transactions.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-muted-foreground text-sm">
        Todavía no hay movimientos.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {transactions.map((tx, index) => {
        const amount = signedAmount(tx);
        const incoming = amount > 0;
        const status = transactionStatusLabel(tx.status);
        const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
        const detail = [transactionTypeLabel(tx.type), showProduct && productName(tx)]
          .filter(Boolean)
          .join(' · ');
        return (
          <li
            key={`${tx.date}-${tx.last4}-${index}`}
            data-testid="transaction-row"
            className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 hover:bg-secondary/60"
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full',
                incoming
                  ? 'bg-tint-green text-tint-green-foreground'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              <Icon className="size-4" strokeWidth={1.8} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-sm">{transactionLabel(tx)}</span>
              <span className="truncate text-muted-foreground text-xs">
                {detail} · {formatTxDate(tx.date)}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span
                className={cn(
                  'font-medium text-sm tabular-nums',
                  incoming && 'text-tint-green-foreground',
                )}
              >
                {incoming ? '+' : '−'}
                {formatMoney(Math.abs(amount), tx.currency)}
              </span>
              {status && <span className="text-[11px] text-muted-foreground">{status}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
