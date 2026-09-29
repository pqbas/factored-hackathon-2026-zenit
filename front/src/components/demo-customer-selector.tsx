import { Check, ChevronDown, UserRound } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DemoCustomer } from '@/hooks/use-demo-customers';
import { cn } from '@/lib/utils';

// The chip names the bank customer the demo simulates, not the person using it.
export const DEMO_CUSTOMER_HINT = 'Elige qué cliente del banco simular en esta demo';

export function DemoCustomerSelector({
  customers,
  token,
  onChange,
  isLocked,
}: {
  customers: DemoCustomer[];
  token: string | null;
  onChange: (token: string) => void;
  isLocked: boolean;
}) {
  if (customers.length === 0) return null;
  const current = customers.find((c) => c.token === token);

  const trigger = (
    <button
      type="button"
      data-testid="demo-customer-selector"
      disabled={isLocked}
      aria-label={
        current ? `Cliente demo: ${current.label}. ${DEMO_CUSTOMER_HINT}` : DEMO_CUSTOMER_HINT
      }
      className="flex h-7 max-w-72 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-foreground text-xs hover:bg-accent disabled:cursor-default disabled:hover:bg-secondary"
    >
      <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">
        {current ? (
          <>
            <span className="text-muted-foreground">Cliente demo:</span> {current.label}
          </>
        ) : (
          'Elegir cliente demo'
        )}
      </span>
      {!isLocked && <ChevronDown className="size-3 shrink-0 text-muted-foreground" />}
    </button>
  );

  if (isLocked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex">{trigger}</span>
        </TooltipTrigger>
        <TooltipContent>
          {DEMO_CUSTOMER_HINT}. Queda fijo desde el primer mensaje del chat.
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent data-testid="demo-customer-hint">{DEMO_CUSTOMER_HINT}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        {customers.map((customer) => (
          <DropdownMenuItem
            key={customer.token}
            data-testid={`demo-customer-option-${customer.token}`}
            onSelect={() => onChange(customer.token)}
            className="flex items-center gap-2 text-[13px]"
          >
            <Check
              className={cn(
                'size-3.5',
                customer.token === token ? 'opacity-100' : 'opacity-0',
              )}
            />
            {customer.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
