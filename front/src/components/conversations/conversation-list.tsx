import { Search } from 'lucide-react';

import { SidebarUserNav } from '@/components/sidebar-user-nav';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useSession } from '@/contexts/SessionContext';
import { formatListTime, getInitials } from '@/lib/conversations';
import { cn } from '@/lib/utils';
import type { MockConversation } from '@/mocks/conversations';

// Deterministic avatar color per customer, so the same client always gets
// the same color across renders.
const AVATAR_COLORS = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-600',
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
}: {
  conversations: MockConversation[];
  selectedId: string | null;
  onSelect: (customerId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { setOpenMobile } = useSidebar();
  const { session } = useSession();
  const now = new Date();

  return (
    // Same Sidebar as the Agente section (app-sidebar.tsx), shifted past the nav rail.
    <Sidebar className="group-data-[side=left]:border-r-0 md:left-16">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row items-center justify-between">
            <span className="rounded-md px-2 font-semibold text-lg">Chats</span>
          </div>
        </SidebarMenu>
        <div className="relative px-2">
          <Search className="absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/50" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar cliente"
            className="h-8 w-full rounded-md border-0 bg-sidebar-accent pr-2 pl-7 text-sidebar-accent-foreground text-sm placeholder:text-sidebar-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
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
                            {lastMessage?.text}
                          </span>
                          {conversation.unread > 0 && (
                            <span
                              data-testid={`unread-badge-${conversation.customerId}`}
                              className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 font-medium text-[10px] text-white"
                            >
                              {conversation.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {session?.user && (
          <SidebarUserNav
            user={session.user}
            preferredUsername={session.user.preferredUsername ?? null}
          />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
