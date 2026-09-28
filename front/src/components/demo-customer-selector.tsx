import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon } from 'lucide-react';
import type { DemoCustomer } from '@/hooks/use-demo-customers';

export function DemoCustomerSelector({
  customers,
  customerToken,
  onCustomerChange,
  isLocked,
}: {
  customers: DemoCustomer[];
  customerToken: string | null;
  onCustomerChange: (token: string) => void;
  isLocked: boolean;
}) {
  // Nothing to pick from (list still loading, or GET /api/demo-customers failed): the
  // chat works without a sessionToken, so the selector just stays out of the way.
  if (customers.length === 0) {
    return null;
  }

  const selected = customers.find((customer) => customer.token === customerToken);

  const trigger = (
    <DropdownMenuTrigger asChild disabled={isLocked}>
      <Button
        variant="outline"
        disabled={isLocked}
        data-testid="demo-customer-selector"
        className="h-8 px-2 md:h-fit"
      >
        <span className="truncate">{selected?.label ?? 'Cliente demo'}</span>
        <ChevronDownIcon className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {isLocked ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent>
              <p>El cliente se fija al enviar el primer mensaje del chat</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        trigger
      )}

      <DropdownMenuContent align="start">
        {customers.map((customer) => (
          <DropdownMenuItem
            key={customer.token}
            data-testid={`demo-customer-option-${customer.token}`}
            onSelect={() => onCustomerChange(customer.token)}
          >
            {customer.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
