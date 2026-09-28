import {
  CircleAlert,
  CircleHelp,
  ClipboardList,
  Folder,
  HandCoins,
  HeartHandshake,
  type LucideIcon,
  UserRound,
  XCircle,
} from 'lucide-react';

import { OTHER_GROUP, useCaseLabelOf } from '@/lib/advisor';
import { cn } from '@/lib/utils';

// Soft label colors per use case, readable in both themes.
const STYLE: Record<string, { icon: LucideIcon; chip: string; icon_: string }> = {
  COMPLAINT: {
    icon: CircleAlert,
    chip: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    icon_: 'text-rose-600 dark:text-rose-400',
  },
  GENERAL_INQUIRY: {
    icon: CircleHelp,
    chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    icon_: 'text-sky-600 dark:text-sky-400',
  },
  CASE_STATUS: {
    icon: ClipboardList,
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    icon_: 'text-amber-600 dark:text-amber-400',
  },
  HUMAN_AGENT: {
    icon: UserRound,
    chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    icon_: 'text-violet-600 dark:text-violet-400',
  },
  COMMERCIAL: {
    icon: HandCoins,
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    icon_: 'text-emerald-600 dark:text-emerald-400',
  },
  RETENTION: {
    icon: HeartHandshake,
    chip: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
    icon_: 'text-pink-600 dark:text-pink-400',
  },
  CANCEL: {
    icon: XCircle,
    chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
    icon_: 'text-orange-600 dark:text-orange-400',
  },
};

const NEUTRAL = {
  icon: Folder,
  chip: 'bg-secondary text-muted-foreground',
  icon_: 'text-muted-foreground',
};

export function useCaseStyle(id: string) {
  return STYLE[id] ?? NEUTRAL;
}

export function UseCaseIcon({ id, className }: { id: string; className?: string }) {
  const { icon: Icon, icon_ } = useCaseStyle(id);
  return <Icon className={cn('size-4 shrink-0', icon_, className)} strokeWidth={1.8} />;
}

// Section title in the grouped inbox, like a colored label.
export function UseCaseChip({ id }: { id: string }) {
  return (
    <span
      data-testid={`use-case-chip-${id}`}
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 font-medium text-xs',
        useCaseStyle(id).chip,
      )}
    >
      {id === OTHER_GROUP ? 'Otras' : useCaseLabelOf(id)}
    </span>
  );
}
