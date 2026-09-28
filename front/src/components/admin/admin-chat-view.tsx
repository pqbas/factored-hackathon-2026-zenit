import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Eye, Wrench } from 'lucide-react';

import { messageSummary, ownerLabel } from '@/lib/admin';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@chat-template/core';
import type { Chat } from '@chat-template/db';

export function AdminChatView({
  chat,
  messages,
}: {
  chat: Chat;
  messages: ChatMessage[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-0.5 border-border border-b px-5 py-3">
        <span className="truncate font-semibold text-[15px]">{chat.title}</span>
        <span className="text-muted-foreground text-xs">
          {ownerLabel(chat.userEmail)} ·{' '}
          {format(new Date(chat.createdAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {messages.length === 0 && (
            <p className="py-10 text-center text-muted-foreground text-sm">
              Esta conversación no tiene mensajes guardados.
            </p>
          )}
          {messages.map((message) => {
            const { text, usedTools } = messageSummary(message);
            const isUser = message.role === 'user';
            if (!text && !usedTools) return null;
            return (
              <div
                key={message.id}
                data-testid="admin-message"
                data-role={message.role}
                className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'flex max-w-[80%] flex-col gap-1 rounded-[18px] px-3.5 py-2 text-sm sm:max-w-[65%]',
                    isUser
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground',
                  )}
                >
                  {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
                  {usedTools && (
                    <span
                      className={cn(
                        'flex items-center gap-1 text-xs',
                        isUser ? 'text-primary-foreground/75' : 'text-muted-foreground',
                      )}
                    >
                      <Wrench className="size-3" />
                      Usó una herramienta
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5 px-4 pt-2 pb-4 text-[11px] text-muted-foreground">
        <Eye className="size-3" />
        Solo lectura: el admin no puede escribir en esta conversación.
      </div>
    </div>
  );
}
