import { useNavigate } from 'react-router-dom';
import { ASSISTANT_KIND, ASSISTANT_NAME } from '@/lib/assistant';
import { useWindowSize } from 'usehooks-ts';

import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { useSidebar } from './ui/sidebar';
import { PlusIcon, CloudOffIcon, InfoIcon } from 'lucide-react';
import { useConfig } from '@/hooks/use-config';
import { DemoCustomerSelector } from '@/components/demo-customer-selector';
import type { DemoCustomer } from '@/hooks/use-demo-customers';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ChatHeader({
  chatId,
  customers = [],
  customerToken = null,
  onCustomerChange = () => {},
  isCustomerLocked = false,
}: {
  chatId?: string;
  customers?: DemoCustomer[];
  customerToken?: string | null;
  onCustomerChange?: (token: string) => void;
  isCustomerLocked?: boolean;
}) {
  const navigate = useNavigate();
  const { open } = useSidebar();
  const { chatHistoryEnabled } = useConfig();

  const { width: windowWidth } = useWindowSize();

  return (
    <header className="sticky top-0 z-10 grid h-13 grid-cols-[1fr_auto_1fr] items-center bg-background px-3">
      <div className="flex items-center gap-1">
        <SidebarToggle />
        {(!open || windowWidth < 768) && (
          <Button
            variant="ghost"
            aria-label="Nueva conversación"
            className="size-8 rounded-[7px] p-0 text-muted-foreground"
            onClick={() => {
              navigate('/');
            }}
          >
            <PlusIcon />
          </Button>
        )}
      </div>

      <div className="flex flex-col items-center leading-tight">
        <span data-testid="chat-peer" className="font-semibold text-[13px]">
          {ASSISTANT_NAME}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-online" />
          {ASSISTANT_KIND} · En línea
        </span>
      </div>

      <div className="flex items-center justify-end gap-3 text-muted-foreground">
        <TooltipProvider>
          <DemoCustomerSelector
            customers={customers}
            token={customerToken}
            onChange={onCustomerChange}
            isLocked={isCustomerLocked}
          />
        </TooltipProvider>
        {!chatHistoryEnabled && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <CloudOffIcon className="size-3.5" />
                  <span className="hidden sm:inline">Sin guardar</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>El historial está desactivado: esta conversación no se guarda</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {chatId && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-default">
                  <InfoIcon className="size-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-mono text-xs">ID: {chatId}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </header>
  );
}
