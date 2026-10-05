import { CreditCard, PiggyBank, Wallet, type LucideIcon } from 'lucide-react';

import { type ProductKind } from '@/lib/products';
import { cn } from '@/lib/utils';

const ICONS: Record<ProductKind, { icon: LucideIcon; tint: string }> = {
  credit: { icon: CreditCard, tint: 'bg-tint-amber text-tint-amber-foreground' },
  savings: { icon: PiggyBank, tint: 'bg-tint-green text-tint-green-foreground' },
  other: { icon: Wallet, tint: 'bg-tint-blue text-tint-blue-foreground' },
};

export function ProductIcon({ kind, className }: { kind: ProductKind; className?: string }) {
  const { icon: Icon, tint } = ICONS[kind];
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-[9px]',
        tint,
        className,
      )}
    >
      <Icon className="size-[17px]" strokeWidth={1.8} />
    </span>
  );
}
