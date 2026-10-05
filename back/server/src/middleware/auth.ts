import type { Request, Response, NextFunction } from 'express';
import { getAuthSession, type AuthSession } from '@chat-template/auth';
import { checkChatAccess } from '@chat-template/core';
import { ChatSDKError } from '@chat-template/core/errors';
import { getRole } from '../roles';
import {
  SESSION_COOKIE,
  getAuthMode,
  loadDemoAuthConfig,
  readCookie,
  readSession,
} from '../demo-auth';

// Extend Express Request type to include session
declare global {
  namespace Express {
    interface Request {
      session?: AuthSession;
    }
  }
}

// Password mode's configuration, loaded once on first use (see demo-auth.ts).
let demoAuth: ReturnType<typeof loadDemoAuthConfig> | undefined;
export function getDemoAuth() {
  demoAuth ??= loadDemoAuthConfig();
  return demoAuth;
}

// The session of the signed cookie, for password mode. The X-Forwarded-*
// headers are never read here: outside Databricks Apps anybody can send them.
function passwordSession(req: Request): AuthSession | undefined {
  const demo = getDemoAuth();
  if ('error' in demo) return undefined;
  const username = readSession(
    readCookie(req.headers.cookie, SESSION_COOKIE),
    demo.config.secret,
  );
  const user = demo.config.users.find((u) => u.username === username);
  if (!user) return undefined;
  return {
    user: {
      id: user.email,
      email: user.email,
      name: user.name,
      preferredUsername: user.username,
      type: 'regular',
    },
  };
}

/**
 * Middleware to authenticate requests and attach session to request object
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (getAuthMode() === 'password') {
    req.session = passwordSession(req);
    return next();
  }
  try {
    const session = await getAuthSession({
      getRequestHeader: (name: string) =>
        req.headers[name.toLowerCase()] as string | null,
    });
    req.session = session || undefined;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    next(error);
  }
}

// In password mode every /api/* route needs a session, except the ones that
// create, read or end it. Mounted before the routers; a no-op on Databricks.
const OPEN_API_PATHS = new Set(['/api/session', '/api/login', '/api/logout']);
export function requireSessionInPasswordMode(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (
    getAuthMode() !== 'password' ||
    !req.path.startsWith('/api/') ||
    OPEN_API_PATHS.has(req.path.replace(/\/$/, ''))
  ) {
    return next();
  }
  if (!passwordSession(req)) {
    return res.status(401).json({ code: 'unauthorized' });
  }
  next();
}

/**
 * Middleware to require authentication - returns 401 if no session
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    const response = new ChatSDKError('unauthorized:chat').toResponse();
    return res.status(response.status).json(response.json);
  }
  next();
}

/**
 * Middleware to require admin access - returns 401 without a session, 403 if
 * the session's role is not admin.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const email = req.session?.user?.email;
  if (!email) {
    const response = new ChatSDKError('unauthorized:chat').toResponse();
    return res.status(response.status).json(response.json);
  }

  if (getRole(email) !== 'admin') {
    const response = new ChatSDKError('forbidden:chat').toResponse();
    return res.status(response.status).json(response.json);
  }

  next();
}

/**
 * Middleware to require advisor access - returns 401 without a session, 403 if
 * the session's role is neither advisor nor admin.
 */
export function requireAdvisor(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const email = req.session?.user?.email;
  if (!email) {
    const response = new ChatSDKError('unauthorized:chat').toResponse();
    return res.status(response.status).json(response.json);
  }

  const role = getRole(email);
  if (role !== 'admin' && role !== 'advisor') {
    const response = new ChatSDKError('forbidden:chat').toResponse();
    return res.status(response.status).json(response.json);
  }

  next();
}

export async function requireChatAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const id = getIdFromRequest(req);
  if (!id) {
    console.error(
      'Chat access middleware error: no chat ID provided',
      req.params,
    );
    const error = new ChatSDKError('bad_request:api');
    const response = error.toResponse();
    return res.status(response.status).json(response.json);
  }
  const { allowed, reason } = await checkChatAccess(id, req.session?.user.id);
  if (!allowed) {
    console.error(
      'Chat access middleware error: user does not have access to chat',
      reason,
    );
    const error = new ChatSDKError('forbidden:chat', reason);
    const response = error.toResponse();
    return res.status(response.status).json(response.json);
  }
  next();
}

export const getIdFromRequest = (req: Request): string | undefined => {
  const { id } = req.params;
  if (!id) return undefined;
  return typeof id === 'string' ? id : id[0];
};
