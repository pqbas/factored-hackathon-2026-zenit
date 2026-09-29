import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { getDemoCustomers } from '../demo-customers';

export const demoCustomersRouter: RouterType = Router();

demoCustomersRouter.use(authMiddleware);

/**
 * GET /api/demo-customers - List demo customers for the UI selector
 */
demoCustomersRouter.get(
  '/',
  requireAuth,
  (_req: Request, res: Response) => {
    // Only what the selector needs: the customer id stays on the server.
    res.json({
      customers: getDemoCustomers().map(({ token, label }) => ({ token, label })),
    });
  },
);
