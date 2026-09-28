import { Bot, MessagesSquare, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'agent',
    label: 'Agente',
    to: '/',
    icon: Bot,
    isActive: (pathname) => pathname === '/' || pathname.startsWith('/chat'),
  },
  {
    id: 'chats',
    label: 'Chats',
    to: '/conversations',
    icon: MessagesSquare,
    isActive: (pathname) => pathname.startsWith('/conversations'),
  },
];

export function NavRail() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Menú principal"
      className="relative z-20 flex h-dvh w-16 shrink-0 flex-col items-center gap-2 border-r bg-sidebar py-3"
    >
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground text-sm">
        BA
      </div>
      <TooltipProvider delayDuration={0}>
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Link
                  to={item.to}
                  data-testid={`nav-${item.id}`}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    active &&
                      'bg-sidebar-accent text-sidebar-accent-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </nav>
  );
}
