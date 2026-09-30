import { ASSISTANT_NAME } from '@/lib/assistant';
import {
  ChartColumn,
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
import { UserMenu } from '@/components/user-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSession } from '@/contexts/SessionContext';
import { canAccess, type Role, type Section } from '@/lib/roles';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  label: string;
  to: string;
  section: Section;
  icon: LucideIcon;
  // Overrides label and icon for some roles.
  byRole?: (role: Role) => { label: string; icon: LucideIcon } | null;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'products',
    label: 'Mis productos',
    to: '/products',
    section: 'products',
    icon: Wallet,
    isActive: (pathname) => pathname.startsWith('/products'),
  },
  {
    id: 'agent',
    label: `${ASSISTANT_NAME} (asistente virtual)`,
    to: '/',
    section: 'agent',
    icon: MessageCircle,
    // The customer's own chat; for advisors and admins it's a test tool that
    // plays a bank customer.
    byRole: (role) =>
      role === 'customer' ? null : { label: 'Simulador de cliente (demo)', icon: FlaskConical },
    isActive: (pathname) => pathname === '/' || pathname.startsWith('/chat'),
  },
  {
    id: 'chats',
    label: 'Chats',
    to: '/conversations',
    section: 'chats',
    icon: MessagesSquare,
    isActive: (pathname) => pathname.startsWith('/conversations'),
  },
  {
    id: 'metrics',
    label: 'Métricas',
    to: '/metrics',
    section: 'metrics',
    icon: ChartColumn,
    isActive: (pathname) => pathname.startsWith('/metrics'),
  },
];

export function NavRail() {
  const { pathname } = useLocation();
  const { session, role, loading } = useSession();
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
        {NAV_ITEMS.filter(
          (item) => !loading && canAccess(role, item.section),
        ).map((item) => {
          const active = item.isActive(pathname);
          const { label, icon: Icon } = item.byRole?.(role) ?? item;
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
        {userName && <UserMenu name={userName} email={session?.user?.email} />}
      </TooltipProvider>
    </nav>
  );
}
