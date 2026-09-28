import { Check, ChevronDown, ListFilter, Search } from 'lucide-react';

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
import { StatusLine } from '@/components/conversations/status-chip';
import {
  type ConversationStatus,
  conversationStatus,
  formatListTime,
  getInitials,
  type StatusFilter,
} from '@/lib/conversations';
import { cn } from '@/lib/utils';
import type { MockConversation, MockMessage } from '@/mocks/conversations';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'waiting', label: 'Sin atender' },
  { id: 'advisor', label: 'En atención' },
];

const PREVIEW_PREFIX: Partial<Record<MockMessage['from'], string>> = {
  assistant: 'Asistente: ',
  advisor: 'Tú: ',
};

function preview(message: MockMessage | undefined): string {
  if (!message) return '';
  const body = message.text || (message.attachment ? 'Imagen' : '');
  return `${PREVIEW_PREFIX[message.from] ?? ''}${body}`;
}

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
  conversations,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  counts,
}: {
  conversations: MockConversation[];
  selectedId: string | null;
  onSelect: (customerId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  counts: Record<ConversationStatus, number>;
}) {
  const { setOpenMobile } = useSidebar();
  const now = new Date();

  return (
    // Same Sidebar as the Agente section (app-sidebar.tsx), shifted past the nav rail.
    <Sidebar variant="inset" className="md:left-16">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row items-center justify-between">
            <span className="flex h-9 items-center pl-2 font-semibold text-[15px] tracking-tight">Chats</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="status-filter-trigger"
                  className="flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-muted-foreground text-xs hover:bg-secondary hover:text-foreground"
                >
                  <ListFilter className="size-3.5" />
                  {statusFilter === 'all'
                    ? 'Filtros'
                    : FILTERS.find((f) => f.id === statusFilter)?.label}
                  <ChevronDown className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {FILTERS.map((filter) => (
                  <DropdownMenuItem
                    key={filter.id}
                    data-testid={`status-filter-${filter.id}`}
                    onSelect={() => onStatusFilterChange(filter.id)}
                    className="flex items-center gap-2 text-[13px]"
                  >
                    <Check
                      className={cn(
                        'size-3.5',
                        filter.id === statusFilter ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="flex-1">{filter.label}</span>
                    {filter.id === 'waiting' && (
                      <span className="text-muted-foreground tabular-nums">
                        {counts.waiting}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarMenu>
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
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {conversations.map((conversation) => {
                const lastMessage = conversation.messages.at(-1);
                const isSelected = conversation.customerId === selectedId;

                return (
                  <SidebarMenuItem key={conversation.customerId}>
                    <SidebarMenuButton
                      size="lg"
                      isActive={isSelected}
                      data-testid={`conversation-row-${conversation.customerId}`}
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelect(conversation.customerId);
                        setOpenMobile(false);
                      }}
                      className="h-auto py-2"
                    >
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-medium text-white text-xs',
                          avatarColor(conversation.customerId),
                        )}
                      >
                        {getInitials(conversation.name)}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{conversation.name}</span>
                          {lastMessage && (
                            <span className="shrink-0 font-normal text-sidebar-foreground/50 text-xs">
                              {formatListTime(lastMessage.sentAt, now)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-normal text-sidebar-foreground/60 text-xs">
                            {preview(lastMessage)}
                          </span>
                          {conversation.unread > 0 && (
                            <span
                              data-testid={`unread-badge-${conversation.customerId}`}
                              className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground"
                            >
                              {conversation.unread}
                            </span>
                          )}
                        </div>
                        <StatusLine
                          status={conversationStatus(conversation)}
                          topic={conversation.topic}
                        />
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

    </Sidebar>
  );
}
