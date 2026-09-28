import { SendHorizontal, Zap } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { QUICK_REPLIES } from '@/lib/advisor';
import { cn } from '@/lib/utils';

export function AdvisorComposer({
  disabled,
  placeholder,
  onSend,
}: {
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState('');
  const [showReplies, setShowReplies] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const text = draft.trim();
    if (!text || disabled || sending) return;
    setSending(true);
    const sent = await onSend(text);
    setSending(false);
    if (sent) setDraft('');
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
      {showReplies && !disabled && (
        <div className="flex gap-1.5 overflow-x-auto">
          {QUICK_REPLIES.map((reply, i) => (
            <button
              key={reply}
              type="button"
              data-testid={`quick-reply-${i}`}
              onClick={() => setDraft(reply)}
              className="h-7 shrink-0 rounded-full border border-input px-3 text-xs hover:bg-secondary"
            >
              {reply}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Respuestas rápidas"
          aria-pressed={showReplies}
          disabled={disabled}
          onClick={() => setShowReplies((v) => !v)}
          className={cn(
            'size-9 shrink-0 rounded-full',
            showReplies ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <Zap className="size-[17px]" />
        </Button>
        <div className="flex h-[46px] flex-1 items-center gap-2 rounded-full border border-input bg-background pr-1.5 pl-5">
          <input
            value={draft}
            disabled={disabled}
            aria-label="Mensaje al cliente"
            placeholder={placeholder}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          />
          <Button
            type="button"
            size="icon"
            aria-label="Enviar"
            onClick={handleSend}
            disabled={disabled || sending || !draft.trim()}
            className="size-[34px] shrink-0 rounded-full"
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
