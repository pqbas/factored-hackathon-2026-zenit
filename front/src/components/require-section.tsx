import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useSession } from '@/contexts/SessionContext';
import { canAccess, type Section } from '@/lib/roles';

export function RequireSection({
  section,
  children,
}: {
  section: Section;
  children: ReactNode;
}) {
  const { role, loading } = useSession();
  // Don't flash a section before knowing whether the role can see it.
  if (loading) return null;
  if (!canAccess(role, section)) return <NoAccess />;
  return <>{children}</>;
}

export function NoAccess() {
  return (
    <div
      data-testid="no-access"
      className="m-2 flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-background text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Lock className="size-5" strokeWidth={1.8} />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-lg tracking-tight">Sin acceso</h1>
        <p className="text-muted-foreground text-sm">
          Tu rol no puede ver esta sección.
        </p>
      </div>
      <Link
        to="/"
        className="rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
      >
        Ir al asistente
      </Link>
    </div>
  );
}
