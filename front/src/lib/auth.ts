// The demo login used outside Databricks Apps (AWS): fixed users with a
// password and an HttpOnly session cookie set by the back. In Databricks Apps
// the back identifies the user from the platform's headers and none of this
// shows.

import type { ClientSession } from '@chat-template/auth';

export type AuthMode = 'databricks' | 'password';

// `authMode` is additive in the back's session contract; a back that doesn't
// send it is Databricks Apps.
export function authModeOf(session: unknown): AuthMode {
  return (session as { authMode?: unknown } | null)?.authMode === 'password' ? 'password' : 'databricks';
}

export type LoginErrorKind = 'invalid' | 'rate-limited' | 'failed';

export function loginErrorOf(status: number): LoginErrorKind {
  if (status === 401) return 'invalid';
  if (status === 429) return 'rate-limited';
  return 'failed';
}

export class LoginError extends Error {
  constructor(public kind: LoginErrorKind) {
    super(kind);
  }
}

export async function login(username: string, password: string): Promise<ClientSession> {
  let res: Response;
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new LoginError('failed');
  }
  if (!res.ok) throw new LoginError(loginErrorOf(res.status));
  return res.json();
}

export type DemoLogin = { username: string; password: string };

// The credentials the back lists for the demo (GET /api/demo-logins). Any
// failure is no table, never an error on the login screen.
export async function fetchDemoLogins(): Promise<DemoLogin[]> {
  try {
    const res = await fetch('/api/demo-logins', { credentials: 'include' });
    if (!res.ok) return [];
    const body = await res.json();
    if (!Array.isArray(body?.logins)) return [];
    return body.logins.every(
      (row: unknown) =>
        typeof (row as DemoLogin)?.username === 'string' && typeof (row as DemoLogin)?.password === 'string',
    )
      ? body.logins
      : [];
  } catch {
    return [];
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
}

// The session expired: an /api/* call answered 401 with exactly this code.
// The demo customer's 401s (code 'unauthorized:chat', an invalid or expired
// customer token) are a different thing and don't end the session.
export async function isSessionExpired(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = await res.clone().json();
    return body?.code === 'unauthorized';
  } catch {
    return false;
  }
}

function pathOf(input: RequestInfo | URL): string {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return '';
  }
}

const SKIP = new Set(['/api/session', '/api/login', '/api/logout', '/api/demo-logins']);

// Wraps window.fetch once, so no /api/* call can miss an expired session.
// Returns the function that removes the wrapper.
export function watchExpiredSession(onExpired: () => void): () => void {
  const original = window.fetch;
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    const path = pathOf(input);
    if (path.startsWith('/api/') && !SKIP.has(path) && (await isSessionExpired(res))) onExpired();
    return res;
  };
  return () => {
    window.fetch = original;
  };
}
