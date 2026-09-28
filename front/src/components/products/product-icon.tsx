import {
  CreditCard,
  HandCoins,
  House,
  Landmark,
  PiggyBank,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ProductType } from '@/mocks/products';

const ICONS: Record<ProductType, { icon: LucideIcon; tint: string }> = {
  'Checking Account': {
    icon: Landmark,
    tint: 'bg-tint-blue text-tint-blue-foreground',
  },
  'Savings Account': {
    icon: PiggyBank,
    tint: 'bg-tint-green text-tint-green-foreground',
  },
  'Debit Card': {
    icon: CreditCard,
    tint: 'bg-tint-blue text-tint-blue-foreground',
  },
  'Credit Card': {
    icon: CreditCard,
    tint: 'bg-tint-amber text-tint-amber-foreground',
  },
  'Personal Loan': {
    icon: HandCoins,
    tint: 'bg-tint-red text-tint-red-foreground',
  },
  Mortgage: { icon: House, tint: 'bg-tint-red text-tint-red-foreground' },
  Investment: {
    icon: TrendingUp,
    tint: 'bg-tint-green text-tint-green-foreground',
  },
};

export function ProductIcon({
  type,
  className,
}: {
  type: ProductType;
  className?: string;
}) {
  const { icon: Icon, tint } = ICONS[type];
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
