import { useNavigate } from 'react-router-dom';
import { ASSISTANT_NAME } from '@/lib/assistant';
import { useLang } from '@/contexts/LangContext';
import { LangSwitch } from '@/components/lang-switch';
import { useWindowSize } from 'usehooks-ts';

import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { useSidebar } from './ui/sidebar';
import { PlusIcon, CloudOffIcon, InfoIcon } from 'lucide-react';
import { useConfig } from '@/hooks/use-config';
import { cn } from '@/lib/utils';
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
  handledBy = 'ai_agent',
  agentPending = false,
}: {
  chatId?: string;
  customers?: DemoCustomer[];
  customerToken?: string | null;
  onCustomerChange?: (token: string) => void;
  isCustomerLocked?: boolean;
  handledBy?: 'ai_agent' | 'human_queue' | 'human_agent';
  // The agent is unavailable and the customer's turn waits in the queue.
  agentPending?: boolean;
}) {
  const { t } = useLang();
  // Who is on the other side of the chat right now.
  const peer =
    handledBy === 'human_agent'
      ? { name: t.advisor, status: t.advisorAttending }
      : handledBy === 'human_queue'
        ? { name: t.advisor, status: t.advisorWaiting }
        : {
            name: ASSISTANT_NAME,
            status: `${t.assistantKind} · ${agentPending ? t.unavailable : t.online}`,
          };
  const unavailable = handledBy === 'ai_agent' && agentPending;
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
            aria-label={t.newChat}
            className="size-8 rounded-[7px] p-0 text-muted-foreground"
            onClick={() => {
              navigate('/');
            }}
          >
            <PlusIcon />
          </Button>
        )}
        <div className="ml-1">
          <LangSwitch />
        </div>
      </div>

      <div className="flex flex-col items-center leading-tight">
        <span data-testid="chat-peer" className="font-semibold text-[13px]">
          {peer.name}
        </span>
        <span
          data-testid="chat-peer-status"
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <span
            data-testid="chat-peer-dot"
            className={cn(
              'size-1.5 rounded-full',
              handledBy === 'human_queue' || unavailable ? 'bg-tint-amber-foreground' : 'bg-online',
            )}
          />
          {peer.status}
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
                  <span className="hidden sm:inline">{t.notSaved}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t.historyOff}</p>
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
