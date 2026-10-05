import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { authMiddleware } from '../middleware/auth';
import type { ClientSession } from '@chat-template/auth';
import { getRole } from '../roles';
import { getAuthMode } from '../demo-auth';

export const sessionRouter: RouterType = Router();

// Apply auth middleware
sessionRouter.use(authMiddleware);

/**
 * GET /api/session - Get current user session
 */
sessionRouter.get('/', async (req: Request, res: Response) => {
  const session = req.session;

  if (!session?.user) {
    return res.json({ user: null, authMode: getAuthMode() });
  }

  // Return minimal user data for client
  const clientSession: ClientSession & { authMode: string } = {
    authMode: getAuthMode(),
    user: {
      email: session.user.email,
      name: session.user.name,
      preferredUsername: session.user.preferredUsername,
      role: getRole(session.user.email),
    },
  };

  res.json(clientSession);
});
