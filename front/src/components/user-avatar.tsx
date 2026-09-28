import { getInitials } from '@/lib/conversations';
import { cn } from '@/lib/utils';

export function UserAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-zinc-400 to-zinc-500 font-semibold text-white text-xs',
        className,
      )}
    >
      {getInitials(name)}
    </div>
  );
}
