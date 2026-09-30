import { BrandMark } from '@/components/brand-mark';
import { useLang } from '@/contexts/LangContext';
import { cardColor, maskedCardNumber, type Product } from '@/lib/products';
import { cn } from '@/lib/utils';

// A credit card as a card: only what the bank returns (last 4 digits and
// currency). No full number, CVV, expiry or holder: they aren't in the data.
export function CreditCardVisual({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useLang();
  return (
    <button
      type="button"
      data-testid={`card-visual-${product.last4}`}
      aria-pressed={selected}
      aria-label={`${t.products.creditCard} ${maskedCardNumber(product.last4)}`}
      onClick={onSelect}
      className={cn(
        'relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl p-4 text-left sm:p-5 text-white shadow-md transition-transform',
        cardColor(product),
        selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : 'opacity-90 hover:opacity-100',
      )}
    >
      {/* A soft sheen, like a card's finish. */}
      <span className="pointer-events-none absolute -top-1/2 -right-1/4 size-full rounded-full bg-white/10 blur-2xl" />
      <span className="relative flex items-start justify-between">
        <BrandMark size={32} className="bg-white/20 shadow-none" />
        <span className="font-medium text-sm text-white/90">{t.products.creditCard}</span>
      </span>
      <span className="relative flex items-end justify-between gap-3">
        <span className="min-w-0 whitespace-nowrap font-mono text-xs sm:text-[15px] sm:tracking-wider">
          {maskedCardNumber(product.last4)}
        </span>
        <span className="shrink-0 font-semibold text-sm text-white/90">{product.currency}</span>
      </span>
    </button>
  );
}
