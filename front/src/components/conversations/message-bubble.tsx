import { ASSISTANT_KIND } from '@/lib/assistant';
import { ArrowRight, CheckCheck } from 'lucide-react';

import type { Bubble } from '@/lib/advisor';
import { formatListTime } from '@/lib/conversations';
import { cn } from '@/lib/utils';

export function MessageBubble({ bubble, now }: { bubble: Bubble; now: Date }) {
  const outgoing = bubble.from === 'assistant' || bubble.from === 'advisor';

  return (
    <div
      data-testid={outgoing ? 'bubble-agent' : 'bubble-customer'}
      data-sender={bubble.from}
      className={cn('mb-2 flex', outgoing ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'flex max-w-[80%] flex-col rounded-[18px] px-3.5 py-2 sm:max-w-[65%]',
          outgoing
            ? 'bg-wa-agent-bubble text-primary-foreground'
            : 'bg-wa-customer-bubble text-foreground',
        )}
      >
        {bubble.label && (
          <span
            data-testid={bubble.from === 'advisor' ? 'bubble-advisor' : undefined}
            title={bubble.from === 'assistant' ? ASSISTANT_KIND : undefined}
            className="font-semibold text-[11px] text-primary-foreground/80"
          >
            {bubble.label}
          </span>
        )}
        <p className="whitespace-pre-wrap break-words text-sm">{bubble.text}</p>
        <div className="mt-1 flex items-center justify-end gap-1">
          <span
            className={cn(
              'text-[11px]',
              outgoing ? 'text-primary-foreground/75' : 'text-muted-foreground',
            )}
          >
            {formatListTime(bubble.sentAt, now)}
          </span>
          {outgoing && <CheckCheck className="h-3.5 w-3.5 text-wa-check" />}
        </div>
      </div>
    </div>
  );
}

export function SystemNotice({ bubble, now }: { bubble: Bubble; now: Date }) {
  return (
    <div className="my-3 flex justify-center">
      <span
        data-testid="system-notice"
        className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-muted-foreground text-xs"
      >
        <ArrowRight className="size-3" strokeWidth={2.2} />
        {bubble.text} · {formatListTime(bubble.sentAt, now)}
      </span>
    </div>
  );
}
