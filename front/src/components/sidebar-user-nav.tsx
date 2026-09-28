import { UserAvatar } from '@/components/user-avatar';
import type { ClientSession } from '@chat-template/auth';

export function SidebarUserNav({
  user,
  preferredUsername,
}: {
  user: ClientSession['user'];
  preferredUsername: string | null;
}) {
  const displayName =
    preferredUsername || user?.name || user?.email || 'Usuario';

  return (
    <div
      data-testid="user-nav-button"
      className="flex items-center gap-2.5 px-2 pb-1"
    >
      <UserAvatar name={displayName} className="size-7 text-[11px]" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-[13px]">{displayName}</span>
        {user?.email && user.email !== displayName && (
          <span
            data-testid="user-email"
            className="truncate text-[11px] text-muted-foreground"
          >
            {user.email}
          </span>
        )}
      </div>
    </div>
  );
}
