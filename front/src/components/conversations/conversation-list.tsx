import { Check, ChevronDown, ListFilter, Search, Users } from 'lucide-react';

import { StatusLine } from '@/components/conversations/status-chip';
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
  type AdvisorChat,
  type ChatOwner,
  customerLabel,
  type InboxFilter,
  statusOf,
  useCaseLabel,
} from '@/lib/advisor';
import { formatListTime, getInitials } from '@/lib/conversations';
import { cn } from '@/lib/utils';

// Deterministic avatar color per customer, so the same client always gets
// the same color across renders.
const AVATAR_COLORS = [
  'bg-linear-to-b from-zinc-400 to-zinc-500',
  'bg-linear-to-b from-slate-400 to-slate-500',
  'bg-linear-to-b from-stone-400 to-stone-500',
  'bg-linear-to-b from-emerald-600/80 to-emerald-700/80',
  'bg-linear-to-b from-sky-600/80 to-sky-700/80',
];

export function avatarColor(customerId: string): string {
  const hash = customerId
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function ConversationList({
  chats,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  hasMore,
  onLoadMore,
  filters,
  users,
  userId = null,
  onUserChange,
}: {
  chats: AdvisorChat[];
  selectedId: string | null;
  onSelect: (chatId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  filters: { id: InboxFilter; label: string }[];
  // Admin only: filter the inbox by conversation owner.
  users?: ChatOwner[];
  userId?: string | null;
  onUserChange?: (userId: string | null) => void;
}) {
  const selectedUser = users?.find((u) => u.userId === userId);
  const { setOpenMobile } = useSidebar();
  const now = new Date();

  return (
    // Same Sidebar as the Agente section (app-sidebar.tsx), shifted past the nav rail.
    <Sidebar variant="inset" className="md:left-16">
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <span className="flex h-9 items-center pl-2 font-semibold text-[15px] tracking-tight">
            Chats
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="status-filter-trigger"
                className="flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-muted-foreground text-xs hover:bg-secondary hover:text-foreground"
              >
                <ListFilter className="size-3.5" />
                {filters.find((f) => f.id === filter)?.label}
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {filters.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  data-testid={`status-filter-${option.id}`}
                  onSelect={() => onFilterChange(option.id)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <Check
                    className={cn(
                      'size-3.5',
                      option.id === filter ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="relative px-2">
          <Search className="absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/50" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar cliente"
            className="h-7 w-full rounded-[7px] border-0 bg-secondary pr-2 pl-7 text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        {users && onUserChange && (
          <div className="px-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="user-filter"
                  className="flex h-7 w-full items-center gap-1.5 rounded-[7px] bg-secondary px-2 text-[13px] text-foreground"
                >
                  <Users className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-left">
                    {selectedUser
                      ? (selectedUser.userEmail ?? 'Sin email')
                      : 'Todos los usuarios'}
                  </span>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {[{ userId: null, userEmail: 'Todos los usuarios' }, ...users].map(
                  (user) => (
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
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {chats.length === 0 && (
              <p
                data-testid="inbox-empty"
                className="px-3 py-6 text-center text-muted-foreground text-xs"
              >
                No hay conversaciones en esta bandeja.
              </p>
            )}
            <SidebarMenu>
              {chats.map((chat) => {
                const isSelected = chat.id === selectedId;
                const name = customerLabel(chat);
                return (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton
                      size="lg"
                      isActive={isSelected}
                      data-testid={`conversation-row-${chat.id}`}
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelect(chat.id);
                        setOpenMobile(false);
                      }}
                      className="h-auto py-2"
                    >
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-medium text-white text-xs',
                          avatarColor(chat.userId),
                        )}
                      >
                        {getInitials(name)}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{name}</span>
                          <span className="shrink-0 font-normal text-sidebar-foreground/50 text-xs">
                            {formatListTime(chat.createdAt, now)}
                          </span>
                        </div>
                        <span className="truncate font-normal text-sidebar-foreground/60 text-xs">
                          {chat.title}
                        </span>
                        <StatusLine status={statusOf(chat)} topic={useCaseLabel(chat)} />
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            {hasMore && (
              <button
                type="button"
                data-testid="inbox-load-more"
                onClick={onLoadMore}
                className="mx-2 mt-2 h-8 w-[calc(100%-1rem)] rounded-lg text-muted-foreground text-xs hover:bg-secondary hover:text-foreground"
              >
                Cargar más
              </button>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
