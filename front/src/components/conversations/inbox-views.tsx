import { Check, CheckCircle2, ChevronDown, Hourglass, Inbox, UserCheck, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { UseCaseIcon } from '@/components/conversations/use-case-style';
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { type ChatOwner, type InboxView, sameView, USE_CASES } from '@/lib/advisor';
import { cn } from '@/lib/utils';

function ViewItem({
  view,
  current,
  onSelect,
  icon,
  label,
  testId,
}: {
  view: InboxView;
  current: InboxView;
  onSelect: (view: InboxView) => void;
  icon: ReactNode;
  label: string;
  testId: string;
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
        <span className="truncate">{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// Left column of Chats: the inbox, one view per use case and the state views.
// Replaces the old "Filtros" menu.
export function InboxViews({
  view,
  onViewChange,
  isAdmin,
  users,
  userId,
  onUserChange,
}: {
  view: InboxView;
  onViewChange: (view: InboxView) => void;
  isAdmin: boolean;
  users: ChatOwner[];
  userId: string | null;
  onUserChange: (userId: string | null) => void;
}) {
  const selectedUser = users.find((u) => u.userId === userId);
  const item = (v: InboxView, icon: ReactNode, label: string, testId: string) => (
    <ViewItem
      key={testId}
      view={v}
      current={view}
      onSelect={onViewChange}
      icon={icon}
      label={label}
      testId={testId}
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px]">Casos de uso</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {USE_CASES.map((u) =>
                item(
                  { kind: 'useCase', useCase: u.id },
                  <UseCaseIcon id={u.id} />,
                  u.label,
                  `view-use-case-${u.id}`,
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px]">Estado</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {item(
                { kind: 'waiting' },
                <Hourglass className="size-4 shrink-0 text-tint-amber-foreground" strokeWidth={1.8} />,
                'Sin atender',
                'view-waiting',
              )}
              {!isAdmin &&
                item({ kind: 'mine' }, <UserCheck className={muted} strokeWidth={1.8} />, 'Mías', 'view-mine')}
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
