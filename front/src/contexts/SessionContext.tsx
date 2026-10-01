import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { mutate } from 'swr';
import type { ClientSession } from '@chat-template/auth';
import {
  type AuthMode,
  authModeOf,
  login as requestLogin,
  logout as requestLogout,
  watchExpiredSession,
} from '@/lib/auth';
import { type Role, roleOf } from '@/lib/roles';

interface SessionContextType {
  session: ClientSession | null;
  // From `session.user.role`; `customer` when missing or unknown.
  role: Role;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  // 'password' outside Databricks Apps: the demo login applies.
  authMode: AuthMode;
  // Password mode without a signed-in user: only the login screen shows.
  needsLogin: boolean;
  // Throws LoginError when the credentials are wrong or the request fails.
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/session', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session');
      }

      const data = await response.json();
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const authMode = authModeOf(session);

  // An expired session (401 `unauthorized` from any /api/* call) goes back to
  // the login: the user is dropped, the mode stays.
  useEffect(() => {
    if (authMode !== 'password') return;
    return watchExpiredSession(() =>
      setSession((current) => (current?.user ? ({ ...current, user: null } as ClientSession) : current)),
    );
  }, [authMode]);

  const login = useCallback(async (username: string, password: string) => {
    setSession(await requestLogin(username, password));
    // Requests made while signed out failed with 401: ask again.
    void mutate(() => true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await requestLogout();
    } finally {
      setSession((current) => (current ? ({ ...current, user: null } as ClientSession) : current));
      // The next user must not see this one's cached data.
      void mutate(() => true, undefined, { revalidate: false });
    }
  }, []);

  return (
    <SessionContext.Provider
      value={{
        session,
        role: roleOf(session),
        loading,
        error,
        refetch: fetchSession,
        authMode,
        needsLogin: authMode === 'password' && !session?.user,
        login,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
