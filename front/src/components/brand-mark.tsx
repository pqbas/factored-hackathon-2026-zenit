import { cn } from '@/lib/utils';

// The bank's mark: a sage rounded square with a soft peak.
export function BrandMark({
  size = 36,
  pulse = false,
  className,
}: {
  size?: number;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[28%] bg-primary shadow-xs',
        pulse && 'animate-pulse',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 18c4-1 6-5 8-12 2 7 4 11 8 12" />
      </svg>
    </div>
  );
}
