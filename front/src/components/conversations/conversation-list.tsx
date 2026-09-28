import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
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
  const now = new Date();

  return (
    <div className="flex h-full flex-col border-r bg-background">
      <div className="flex items-center px-4 py-3">
        <h1 className="font-semibold text-lg">Chats</h1>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar cliente"
            className="rounded-full bg-muted pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.map((conversation) => {
          const lastMessage =
            conversation.messages[conversation.messages.length - 1];
          const isSelected = conversation.customerId === selectedId;

          return (
            <button
              key={conversation.customerId}
              type="button"
              data-testid={`conversation-row-${conversation.customerId}`}
              aria-selected={isSelected}
              onClick={() => onSelect(conversation.customerId)}
              className={cn(
                'flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-accent/50',
                isSelected && 'bg-wa-list-active hover:bg-wa-list-active',
              )}
            >
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-medium text-sm text-white',
                  avatarColor(conversation.customerId),
                )}
              >
                {getInitials(conversation.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {conversation.name}
                  </span>
                  {lastMessage && (
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {formatListTime(lastMessage.sentAt, now)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground text-sm">
                    {lastMessage?.text}
                  </span>
                  {conversation.unread > 0 && (
                    <span
                      data-testid={`unread-badge-${conversation.customerId}`}
                      className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 font-medium text-[11px] text-white"
                    >
                      {conversation.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
