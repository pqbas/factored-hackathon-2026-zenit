import { useEffect, useState } from 'react';

import { ASSISTANT_NAME } from '@/lib/assistant';
import { cn } from '@/lib/utils';

// After this long without text, say what David is doing: warehouse queries
// can take several seconds.
export const SLOW_TYPING_MS = 3000;

export function TypingIndicator({ className }: { className?: string }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_TYPING_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      data-testid="typing-indicator"
      role="status"
      aria-label={`${ASSISTANT_NAME} está escribiendo`}
      className={cn('flex flex-col gap-1', className)}
    >
      <span className="flex h-5 items-center gap-1">
        {['[animation-delay:0ms]', '[animation-delay:150ms]', '[animation-delay:300ms]'].map(
          (delay) => (
            <span
              key={delay}
              className={cn('size-1.5 animate-bounce rounded-full bg-current opacity-60', delay)}
            />
          ),
        )}
      </span>
      {slow && (
        <span data-testid="typing-slow-text" className="text-xs opacity-75">
          {ASSISTANT_NAME} está consultando tus datos…
        </span>
      )}
    </div>
  );
}
