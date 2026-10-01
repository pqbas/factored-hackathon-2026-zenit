import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import type { ClientSession } from '@chat-template/auth';
import {
  SESSION_TTL_MS,
  clientIp,
  createAttemptLimiter,
  findDemoUser,
  getAuthMode,
  sessionCookie,
  signSession,
} from '../demo-auth';
import { getDemoAuth } from '../middleware/auth';
import { getRole } from '../roles';

// The demo login of password mode (AWS). On Databricks Apps the platform
// authenticates, so these routes don't exist there (404).
export const authRouter: RouterType = Router();

const attempts = createAttemptLimiter();

authRouter.use((_req, res, next) => {
  if (getAuthMode() !== 'password') return res.status(404).end();
  next();
});

/**
 * POST /api/login { username, password } - Signs a demo user in: the body of
 * GET /api/session plus the session cookie. 401 invalid_credentials, 429
 * too_many_attempts after 10 failures per IP in 5 minutes.
 */
authRouter.post('/login', (req: Request, res: Response) => {
  const demo = getDemoAuth();
  if ('error' in demo) {
    return res.status(503).json({ code: 'login_unavailable' });
  }

  const ip = clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress);
  if (attempts.isBlocked(ip)) {
    return res.status(429).json({ code: 'too_many_attempts' });
  }

  const { username, password } = req.body ?? {};
  const user =
    typeof username === 'string' && typeof password === 'string'
      ? findDemoUser(demo.config.users, username, password)
      : null;
  if (!user) {
    attempts.fail(ip);
    return res.status(401).json({ code: 'invalid_credentials' });
  }
  attempts.reset(ip);

  const value = signSession(
    { username: user.username, exp: Date.now() + SESSION_TTL_MS },
    demo.config.secret,
  );
  res.setHeader(
    'Set-Cookie',
    sessionCookie(value, demo.config.secureCookie, SESSION_TTL_MS),
  );
  res.json({
    user: {
      email: user.email,
      name: user.name,
      preferredUsername: user.username,
      role: getRole(user.email),
    },
    authMode: 'password',
  } satisfies ClientSession & { authMode: string });
});

/**
 * POST /api/logout - Ends the session: 204 and an expired cookie.
 */
authRouter.post('/logout', (_req: Request, res: Response) => {
  const demo = getDemoAuth();
  const secure = 'config' in demo ? demo.config.secureCookie : true;
  res.setHeader('Set-Cookie', sessionCookie('', secure, 0));
  res.status(204).end();
});
