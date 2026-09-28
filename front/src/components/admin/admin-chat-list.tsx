import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, ChevronDown, Users } from 'lucide-react';

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
import { type ChatOwner, ownerLabel } from '@/lib/admin';
import { cn } from '@/lib/utils';
import type { Chat } from '@chat-template/db';

export function AdminChatList({
  chats,
  users,
  userId,
  onUserChange,
  selectedId,
  onSelect,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  chats: Chat[];
  users: ChatOwner[];
  userId: string | null;
  onUserChange: (userId: string | null) => void;
  selectedId: string | null;
  onSelect: (chatId: string) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const { setOpenMobile } = useSidebar();
  const selectedUser = users.find((u) => u.userId === userId);

  return (
    <Sidebar variant="inset" className="md:left-16">
      <SidebarHeader>
        <span className="flex h-9 items-center pl-2 font-semibold text-[15px] tracking-tight">
          Todas las conversaciones
        </span>
        <div className="px-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="admin-user-filter"
                className="flex h-7 w-full items-center gap-1.5 rounded-[7px] bg-secondary px-2 text-[13px] text-foreground"
              >
                <Users className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-left">
                  {selectedUser ? ownerLabel(selectedUser.userEmail) : 'Todos los usuarios'}
                </span>
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              {[{ userId: null, userEmail: 'Todos los usuarios' }, ...users].map(
                (user) => (
                  <DropdownMenuItem
                    key={user.userId ?? 'all'}
                    data-testid={`admin-user-option-${user.userId ?? 'all'}`}
                    onSelect={() => onUserChange(user.userId)}
                    className="flex items-center gap-2 text-[13px]"
                  >
                    <Check
                      className={cn(
                        'size-3.5 shrink-0',
                        user.userId === userId ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{ownerLabel(user.userEmail)}</span>
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((chat) => (
                <SidebarMenuItem key={chat.id}>
                  <SidebarMenuButton
                    isActive={chat.id === selectedId}
                    data-testid={`admin-chat-row-${chat.id}`}
                    onClick={() => {
                      onSelect(chat.id);
                      setOpenMobile(false);
                    }}
                    className="h-auto flex-col items-start gap-0.5 rounded-lg px-2.5 py-2"
                  >
                    <span className="w-full truncate text-[13px]">{chat.title}</span>
                    <span className="flex w-full justify-between gap-2 font-normal text-muted-foreground text-xs">
                      <span className="truncate">{ownerLabel(chat.userEmail)}</span>
                      <span className="shrink-0">
                        {format(new Date(chat.createdAt), 'd MMM', { locale: es })}
                      </span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            {hasMore && (
              <button
                type="button"
                data-testid="admin-load-more"
                disabled={isLoadingMore}
                onClick={onLoadMore}
                className="mx-2 mt-2 h-8 w-[calc(100%-1rem)] rounded-lg text-muted-foreground text-xs hover:bg-secondary hover:text-foreground disabled:opacity-60"
              >
                {isLoadingMore ? 'Cargando…' : 'Cargar más'}
              </button>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
