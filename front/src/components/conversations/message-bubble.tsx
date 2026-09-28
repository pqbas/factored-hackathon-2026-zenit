import { ArrowRight, CheckCheck, LockIcon } from 'lucide-react';

import { formatListTime } from '@/lib/conversations';
import { cn } from '@/lib/utils';
import type { MockMessage } from '@/mocks/conversations';

const SENDER_LABEL: Partial<Record<MockMessage['from'], string>> = {
  assistant: 'Asistente',
  advisor: 'Tú',
};

export function MessageBubble({
  message,
  now,
}: {
  message: MockMessage;
  now: Date;
}) {
  const outgoing = message.from === 'assistant' || message.from === 'advisor';
  const { attachment } = message;

  return (
    <div
      data-testid={outgoing ? 'bubble-agent' : 'bubble-customer'}
      data-sender={message.from}
      className={cn('mb-2 flex', outgoing ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'flex max-w-[80%] flex-col rounded-[18px] sm:max-w-[65%]',
          attachment ? 'w-72 gap-1.5 p-1.5' : 'px-3.5 py-2',
          outgoing
            ? 'bg-wa-agent-bubble text-primary-foreground'
            : 'bg-wa-customer-bubble text-foreground',
        )}
      >
        {outgoing && (
          <span
            data-testid={message.from === 'advisor' ? 'bubble-advisor' : undefined}
            className={cn(
              'font-semibold text-[11px] text-primary-foreground/80',
              attachment && 'px-2 pt-1',
            )}
          >
            {SENDER_LABEL[message.from]}
          </span>
        )}
        {attachment && (
          <img
            src={attachment.url}
            alt={attachment.alt}
            className="w-full rounded-[13px] object-cover"
          />
        )}
        {message.text && (
          <p
            className={cn(
              'whitespace-pre-wrap break-words text-sm',
              attachment && 'px-2',
            )}
          >
            {message.text}
          </p>
        )}
        <div
          className={cn(
            'flex items-center gap-1',
            attachment ? 'px-2 pb-0.5' : 'mt-1 justify-end',
          )}
        >
          {attachment && attachment.redactions.length > 0 && (
            <span
              data-testid="redaction-note"
              className={cn(
                'flex items-center gap-1 text-[11px]',
                outgoing
                  ? 'text-primary-foreground/85'
                  : 'text-tint-amber-foreground',
              )}
            >
              <LockIcon className="size-3" strokeWidth={2.2} />
              Ocultamos un {attachment.redactions.join(' y un ')}
            </span>
          )}
          <span
            className={cn(
              'ml-auto text-[11px]',
              outgoing ? 'text-primary-foreground/75' : 'text-muted-foreground',
            )}
          >
            {formatListTime(message.sentAt, now)}
          </span>
          {outgoing && <CheckCheck className="h-3.5 w-3.5 text-wa-check" />}
        </div>
      </div>
    </div>
  );
}

export function SystemNotice({
  message,
  now,
}: {
  message: MockMessage;
  now: Date;
}) {
  return (
    <div className="my-3 flex justify-center">
      <span
        data-testid="system-notice"
        className="flex items-center gap-1.5 rounded-full bg-tint-amber px-3 py-1 font-medium text-tint-amber-foreground text-xs"
      >
        <ArrowRight className="size-3" strokeWidth={2.2} />
        {message.text} · {formatListTime(message.sentAt, now)}
      </span>
    </div>
  );
}
