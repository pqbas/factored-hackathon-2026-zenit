import {
  ChartColumn,
  LogOut,
  FlaskConical,
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
import { LangToggle } from '@/components/lang-toggle';
import { UserAvatar } from '@/components/user-avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLang } from '@/contexts/LangContext';
import { useSession } from '@/contexts/SessionContext';
import type { Messages } from '@/lib/i18n';
import { canAccess, type Role, type Section } from '@/lib/roles';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  label: (t: Messages) => string;
  to: string;
  section: Section;
  icon: LucideIcon;
  // Overrides label and icon for some roles.
  byRole?: (role: Role) => { label: (t: Messages) => string; icon: LucideIcon } | null;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'products',
    label: (t) => t.nav.products,
    to: '/products',
    section: 'products',
    icon: Wallet,
    isActive: (pathname) => pathname.startsWith('/products'),
  },
  {
    id: 'agent',
    label: (t) => t.nav.agent,
    to: '/',
    section: 'agent',
    icon: MessageCircle,
    // The customer's own chat; for advisors and admins it's a test tool that
    // plays a bank customer.
    byRole: (role) =>
      role === 'customer' ? null : { label: (t) => t.nav.simulator, icon: FlaskConical },
    isActive: (pathname) => pathname === '/' || pathname.startsWith('/chat'),
  },
  {
    id: 'chats',
    label: (t) => t.nav.chats,
    to: '/conversations',
    section: 'chats',
    icon: MessagesSquare,
    isActive: (pathname) => pathname.startsWith('/conversations'),
  },
  {
    id: 'metrics',
    label: (t) => t.nav.metrics,
    to: '/metrics',
    section: 'metrics',
    icon: ChartColumn,
    isActive: (pathname) => pathname.startsWith('/metrics'),
  },
];

export function NavRail() {
  const { pathname } = useLocation();
  const { t } = useLang();
  const { session, role, loading, authMode, logout } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const themeLabel = isDark ? t.nav.lightMode : t.nav.darkMode;
  const userName =
    session?.user?.name ||
    session?.user?.preferredUsername ||
    session?.user?.email;

  return (
    <nav
      aria-label={t.nav.mainMenu}
      className="relative z-20 flex h-dvh w-16 shrink-0 flex-col items-center gap-1.5 bg-sidebar py-4"
    >
      <BrandMark className="mb-4" />
      <TooltipProvider delayDuration={0}>
        {NAV_ITEMS.filter(
          (item) => !loading && canAccess(role, item.section),
        ).map((item) => {
          const active = item.isActive(pathname);
          const { label: getLabel, icon: Icon } = item.byRole?.(role) ?? item;
          const label = getLabel(t);
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Link
                  to={item.to}
                  data-testid={`nav-${item.id}`}
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                    active && 'bg-secondary text-primary',
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.7} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        })}
        <div className="flex-1" />
        <LangToggle />
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
        {/* Only with the demo login; Databricks Apps has no session to close. */}
        {authMode === 'password' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-testid="logout-button"
                aria-label={t.auth.logout}
                onClick={() => void logout()}
                className="mb-2 flex size-11 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LogOut className="size-5" strokeWidth={1.7} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t.auth.logout}</TooltipContent>
          </Tooltip>
        )}
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
