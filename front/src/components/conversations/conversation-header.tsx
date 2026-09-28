import { Bot } from 'lucide-react';
import { useState } from 'react';

import { avatarColor } from '@/components/conversations/conversation-list';
import { StatusInline, TagChip } from '@/components/conversations/status-chip';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import {
  conversationStatus,
  getInitials,
  maskPhone,
} from '@/lib/conversations';
import { cn } from '@/lib/utils';
import type { MockConversation } from '@/mocks/conversations';

export function ConversationHeader({
  conversation,
  onToggleAssistant,
  onResolve,
  onAddTag,
}: {
  conversation: MockConversation;
  onToggleAssistant: () => void;
  onResolve: () => void;
  onAddTag: (tag: string) => void;
}) {
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const assistantOn = conversation.handledBy === 'ai_agent';
  const status = conversationStatus(conversation);

  function commitTag() {
    onAddTag(tagDraft);
    setTagDraft('');
    setAddingTag(false);
  }

  return (
    <header className="flex flex-col gap-2.5 border-border border-b px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-3">
        <SidebarToggle />
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full font-medium text-sm text-white',
            avatarColor(conversation.customerId),
          )}
        >
          {getInitials(conversation.name)}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="truncate font-semibold text-[15px]">
              {conversation.name}
            </span>
            <StatusInline status={status} />
          </span>
          <span
            data-testid="customer-meta"
            className="truncate text-muted-foreground text-xs"
          >
            {conversation.customerId} · {maskPhone(conversation.phone)} ·{' '}
            {conversation.channel}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={assistantOn}
          data-testid="assistant-switch"
          onClick={onToggleAssistant}
          className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-secondary pr-2 pl-3 font-medium text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bot
            className={cn(
              'size-4',
              assistantOn ? 'text-primary' : 'text-muted-foreground',
            )}
            strokeWidth={1.8}
          />
          <span className="hidden sm:inline">Asistente</span>
          <span className="w-6 text-left">{assistantOn ? 'ON' : 'OFF'}</span>
          <span
            className={cn(
              'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
              assistantOn ? 'justify-end bg-primary' : 'justify-start bg-input',
            )}
          >
            <span className="size-4 rounded-full bg-white shadow-sm" />
          </span>
        </button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="resolve-button"
          disabled={status === 'resolved'}
          onClick={onResolve}
          className="h-8 rounded-full px-3 text-xs"
        >
          Resolver
        </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-[5.25rem]">
        <TagChip label={conversation.topic} tone="neutral" size="md" />
        {conversation.product && (
          <TagChip label={conversation.product} tone="neutral" size="md" />
        )}
        {conversation.tags.map((tag) => (
          <TagChip key={tag} label={tag} tone="neutral" size="md" />
        ))}
        {addingTag ? (
          <input
            autoFocus
            value={tagDraft}
            aria-label="Nueva etiqueta"
            data-testid="tag-input"
            placeholder="Etiqueta"
            onChange={(e) => setTagDraft(e.target.value)}
            onBlur={commitTag}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTag();
              if (e.key === 'Escape') {
                setTagDraft('');
                setAddingTag(false);
              }
            }}
            className="h-6 w-28 rounded-full border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        ) : (
          <button
            type="button"
            data-testid="add-tag-button"
            onClick={() => setAddingTag(true)}
            className="h-6 rounded-full border border-input border-dashed px-2.5 text-muted-foreground text-xs hover:text-foreground"
          >
            + Etiqueta
          </button>
        )}
      </div>
    </header>
  );
}
