import { useRef, useState } from 'react';

import { CreditCardVisual } from '@/components/products/credit-card-visual';
import { StatTile } from '@/components/products/stat-tile';
import { TransactionList } from '@/components/products/transaction-list';
import { useLang } from '@/contexts/LangContext';
import {
  creditUsage,
  formatMoney,
  type Product,
  type Transaction,
  transactionsFor,
} from '@/lib/products';
import { cn } from '@/lib/utils';

// "Mis tarjetas": the credit cards in a horizontal carousel (scroll-snap),
// and the selected card's balance, limit, usage and movements.
export function CardCarousel({
  cards,
  transactions,
}: {
  cards: Product[];
  transactions: Transaction[];
}) {
  const { t } = useLang();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const card = cards[Math.min(index, cards.length - 1)];
  const money = (amount: number) => formatMoney(amount, card.currency);
  const usage = creditUsage(card);

  // The card a dot or a click is scrolling to: until it's in view, the
  // scroll doesn't move the selection.
  const scrollingTo = useRef<number | null>(null);

  function show(next: number) {
    setIndex(next);
    scrollingTo.current = next;
    const item = trackRef.current?.children[next] as HTMLElement | undefined;
    item?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // Swiping moves the selection to the card at the left edge, unless the
  // selected card is still fully in view (several cards fit on wide screens).
  function onScroll() {
    const track = trackRef.current;
    if (!track) return;
    const left = track.scrollLeft;
    const right = left + track.clientWidth;
    const items = Array.from(track.children) as HTMLElement[];
    const inView = (el: HTMLElement | undefined) =>
      !!el && el.offsetLeft >= left - 1 && el.offsetLeft + el.offsetWidth <= right + 1;
    if (scrollingTo.current !== null) {
      if (inView(items[scrollingTo.current])) scrollingTo.current = null;
      return;
    }
    if (inView(items[index])) return;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    items.forEach((el, i) => {
      const distance = Math.abs(el.offsetLeft - left);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    setIndex(nearest);
  }

  return (
    <section data-testid="card-carousel" className="flex flex-col gap-3">
      <h2 className="px-1 font-semibold text-[15px]">{t.products.myCards}</h2>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="relative flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, i) => (
          // As wide as a column of the 3-column grids around it, so the cards
          // line up with them; the next one peeks inside the content width.
          <div
            key={`${c.productType}-${c.last4}`}
            className="w-[85%] shrink-0 snap-start sm:w-[calc((100%-0.75rem)/2)] lg:w-[calc((100%-1.5rem)/3)]"
          >
            <CreditCardVisual product={c} selected={i === index} onSelect={() => show(i)} />
          </div>
        ))}
      </div>
      {cards.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {cards.map((c, i) => (
            <button
              key={c.last4}
              type="button"
              data-testid={`card-dot-${i}`}
              aria-label={t.products.showCard(i + 1)}
              aria-current={i === index}
              onClick={() => show(i)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-5 bg-foreground' : 'w-1.5 bg-muted-foreground/40',
              )}
            />
          ))}
        </div>
      )}

      <div data-testid="card-detail" className="mt-2 flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label={t.products.balanceUsed} value={money(card.currentBalance)} />
          {card.creditLimit !== null && (
            <StatTile label={t.products.creditLimit} value={money(card.creditLimit)} />
          )}
          {card.availableCredit !== null && (
            <StatTile label={t.products.availableCredit} value={money(card.availableCredit)} />
          )}
        </div>
        {usage !== null && card.creditLimit !== null && (
          <div className="flex flex-col gap-1.5">
            <progress
              value={Math.round(usage * 100)}
              max={100}
              aria-label={t.products.limitUsage}
              className="h-1.5 w-full appearance-none overflow-hidden rounded-full bg-secondary [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
            />
            <span className="text-muted-foreground text-xs">
              {t.products.usage(Math.round(usage * 100), money(card.creditLimit))}
            </span>
          </div>
        )}

        <div className="rounded-[14px] bg-card p-1.5">
          <TransactionList transactions={transactionsFor(transactions, card)} />
        </div>
      </div>
    </section>
  );
}
