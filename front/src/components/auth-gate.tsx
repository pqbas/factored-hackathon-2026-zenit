import type { ReactNode } from 'react';

import { useSession } from '@/contexts/SessionContext';
import LoginPage from '@/pages/LoginPage';

// In password mode (outside Databricks Apps) nothing of the app renders
// without a signed-in user: only the login. In Databricks mode it is
// transparent.
export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, error, needsLogin } = useSession();
  // The first session request decides the mode; rendering the app before it
  // answers would flash it (and fire its requests) ahead of the login.
  if (loading && !session && !error) return null;
  if (needsLogin) return <LoginPage />;
  return <>{children}</>;
}
