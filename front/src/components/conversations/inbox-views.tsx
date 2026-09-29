import { Bot, Check, CheckCircle2, ChevronDown, Hourglass, Inbox, UserCheck, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { HandoffReasonIcon } from '@/components/conversations/use-case-style';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  type ChatOwner,
  countFor,
  type InboxView,
  sameView,
  type ViewCounts,
} from '@/lib/advisor';
import { HANDOFF_REASONS } from '@/lib/handoff-case';
import { cn } from '@/lib/utils';
import { STATUS_LABEL } from '@/lib/conversations';

function ViewItem({
  view,
  current,
  onSelect,
  icon,
  label,
  testId,
  count,
  highlight = false,
  showZero = false,
}: {
  view: InboxView;
  current: InboxView;
  onSelect: (view: InboxView) => void;
  icon: ReactNode;
  label: string;
  testId: string;
  count: number;
  // "En espera" stands out while there are chats waiting.
  highlight?: boolean;
  // Keep the counter visible at 0 (the reason filters).
  showZero?: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={sameView(view, current)}
        data-testid={testId}
        onClick={() => {
          onSelect(view);
          setOpenMobile(false);
        }}
        className="h-8 gap-2.5 rounded-lg px-2.5 text-[13px]"
      >
        {icon}
        <span className="flex-1 truncate">{label}</span>
        {(count > 0 || showZero) && (
          <span
            data-testid={`${testId}-count`}
            className={cn(
              'shrink-0 text-xs tabular-nums',
              highlight
                ? 'rounded-full bg-tint-amber px-1.5 font-semibold text-tint-amber-foreground'
                : 'text-muted-foreground',
            )}
          >
            {count}
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// Left column of Chats: the inbox, one view per handoff reason and the state views.
// Replaces the old "Filtros" menu.
export function InboxViews({
  view,
  onViewChange,
  isAdmin,
  users,
  userId,
  onUserChange,
  counts,
}: {
  view: InboxView;
  onViewChange: (view: InboxView) => void;
  isAdmin: boolean;
  users: ChatOwner[];
  userId: string | null;
  onUserChange: (userId: string | null) => void;
  counts: ViewCounts | undefined;
}) {
  const selectedUser = users.find((u) => u.userId === userId);
  const item = (
    v: InboxView,
    icon: ReactNode,
    label: string,
    testId: string,
    showZero = false,
  ) => (
    <ViewItem
      key={testId}
      view={v}
      current={view}
      onSelect={onViewChange}
      icon={icon}
      label={label}
      testId={testId}
      count={countFor(v, counts)}
      highlight={v.kind === 'waiting'}
      showZero={showZero}
    />
  );
  const muted = 'size-4 shrink-0 text-muted-foreground';

  return (
    <Sidebar variant="inset" className="md:left-16">
      <SidebarHeader>
        <span className="flex h-9 items-center pl-2 font-semibold text-[15px] tracking-tight">
          Chats
        </span>
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="user-filter"
                className="flex h-8 w-full items-center gap-2 rounded-lg bg-secondary px-2.5 text-[13px]"
              >
                <Users className={muted} strokeWidth={1.8} />
                <span className="flex-1 truncate text-left">
                  {selectedUser ? (selectedUser.userEmail ?? 'Sin email') : 'Todos los usuarios'}
                </span>
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              {[{ userId: null, userEmail: 'Todos los usuarios' }, ...users].map((user) => (
                <DropdownMenuItem
                  key={user.userId ?? 'all'}
                  data-testid={`user-option-${user.userId ?? 'all'}`}
                  onSelect={() => onUserChange(user.userId)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <Check
                    className={cn(
                      'size-3.5 shrink-0',
                      user.userId === userId ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{user.userEmail ?? 'Sin email'}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {item({ kind: 'inbox' }, <Inbox className={muted} strokeWidth={1.8} />, 'Bandeja', 'view-inbox')}
              {item(
                { kind: 'david' },
                <Bot className={muted} strokeWidth={1.8} />,
                STATUS_LABEL.assistant,
                'view-david',
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <span className="px-2.5 pb-1.5 font-semibold text-[11px] text-muted-foreground">Motivo de derivación</span>
          <SidebarGroupContent>
            <SidebarMenu>
              {HANDOFF_REASONS.map((r) =>
                item(
                  { kind: 'reason', reason: r.id },
                  <HandoffReasonIcon id={r.id} />,
                  r.label,
                  `view-reason-${r.id}`,
                  true,
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <span className="px-2.5 pb-1.5 font-semibold text-[11px] text-muted-foreground">Estado</span>
          <SidebarGroupContent>
            <SidebarMenu>
              {item(
                { kind: 'waiting' },
                <Hourglass className="size-4 shrink-0 text-tint-amber-foreground" strokeWidth={1.8} />,
                STATUS_LABEL.waiting,
                'view-waiting',
              )}
              {item(
                { kind: 'advisor' },
                <UserCheck className={muted} strokeWidth={1.8} />,
                STATUS_LABEL.advisor,
                'view-advisor',
              )}
              {item(
                { kind: 'resolved' },
                <CheckCircle2 className="size-4 shrink-0 text-tint-green-foreground" strokeWidth={1.8} />,
                'Resueltas',
                'view-resolved',
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
