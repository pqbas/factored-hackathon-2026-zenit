import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  CircleAlert,
  CreditCard,
  Ellipsis,
  List,
  type LucideIcon,
  PiggyBank,
} from 'lucide-react';

import { cn } from '@/lib/utils';

// The options of David's menu (docs/flujo-atencion.md, etapa 2), in the order
// of MESSAGES.actions: the chat's first screen and Mis productos share them.
export const ACTION_STYLES: { icon: LucideIcon; tint: string }[] = [
  { icon: CreditCard, tint: 'bg-tint-green text-tint-green-foreground' },
  { icon: PiggyBank, tint: 'bg-tint-blue text-tint-blue-foreground' },
  { icon: CircleAlert, tint: 'bg-tint-red text-tint-red-foreground' },
  { icon: Ellipsis, tint: 'bg-tint-amber text-tint-amber-foreground' },
];

// Mis productos' extra options.
export const MOVEMENTS_STYLE = {
  icon: List,
  tint: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
};

// MOCKUP: transfers aren't something David does yet.
export const TRANSFER_STYLE = {
  icon: ArrowLeftRight,
  tint: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
};

export function ActionCard({
  icon: Icon,
  tint,
  title,
  description,
  index,
  testId,
  onClick,
}: {
  icon: LucideIcon;
  tint: string;
  title: string;
  description: string;
  index: number;
  testId: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      data-testid={testId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ delay: 0.05 * index }}
      onClick={onClick}
      className="flex items-center gap-3 rounded-[14px] bg-card px-4 py-3.5 text-left transition-colors hover:bg-secondary"
    >
      <span className={cn('flex size-[34px] shrink-0 items-center justify-center rounded-[9px]', tint)}>
        <Icon className="size-[18px]" strokeWidth={1.8} />
      </span>
      <span className="flex flex-col">
        <span className="font-medium text-sm">{title}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
    </motion.button>
  );
}
