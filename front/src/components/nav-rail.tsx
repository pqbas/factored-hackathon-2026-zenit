import {
  MessageCircle,
  MessagesSquare,
  Moon,
  Sun,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Link, useLocation } from 'react-router-dom';

import { BrandMark } from '@/components/brand-mark';
import { UserAvatar } from '@/components/user-avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSession } from '@/contexts/SessionContext';
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
    id: 'products',
    label: 'Mis productos',
    to: '/products',
    icon: Wallet,
    isActive: (pathname) => pathname.startsWith('/products'),
  },
  {
    id: 'agent',
    label: 'Agente',
    to: '/',
    icon: MessageCircle,
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
  const { session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const themeLabel = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  const userName =
    session?.user?.name ||
    session?.user?.preferredUsername ||
    session?.user?.email;

  return (
    <nav
      aria-label="Menú principal"
      className="relative z-20 flex h-dvh w-16 shrink-0 flex-col items-center gap-1.5 bg-sidebar py-4"
    >
      <BrandMark className="mb-4" />
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
                    'flex size-11 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                    active && 'bg-secondary text-primary',
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.7} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="theme-toggle"
              aria-label={themeLabel}
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="mb-2 flex size-11 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {isDark ? (
                <Sun className="size-5" strokeWidth={1.7} />
              ) : (
                <Moon className="size-5" strokeWidth={1.7} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{themeLabel}</TooltipContent>
        </Tooltip>
        {userName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div data-testid="user-avatar" aria-label={userName}>
                <UserAvatar name={userName} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {session?.user?.email ?? userName}
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </nav>
  );
}
