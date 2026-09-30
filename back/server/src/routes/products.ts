import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { ChatSDKError } from '@chat-template/core/errors';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { getRole } from '../roles';
import { findDemoCustomer } from '../demo-customers';
import { getCustomerProfile, getProducts, getTransactions } from '../bank-data';

export const productsRouter: RouterType = Router();

productsRouter.use(authMiddleware);

/**
 * GET /api/products?sessionToken= - The session customer's active products and
 * latest movements, read from the bank's data in Lakebase. Customer or admin only
 * (the advisor doesn't see "Mis productos").
 */
productsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  if (getRole(req.session?.user.email) === 'advisor') {
    const response = new ChatSDKError('forbidden:chat').toResponse();
    return res.status(response.status).json(response.json);
  }

  const token = req.query.sessionToken;
  if (typeof token !== 'string' || !token) {
    const response = new ChatSDKError(
      'bad_request:api',
      'sessionToken is required.',
    ).toResponse();
    return res.status(response.status).json(response.json);
  }

  const customer = findDemoCustomer(token);
  if (!customer || customer.expired) {
    const response = new ChatSDKError('unauthorized:chat').toResponse();
    return res.status(response.status).json({
      ...response.json,
      reason: customer ? 'expired' : 'invalid',
    });
  }

  try {
    const [profile, products, transactions] = await Promise.all([
      getCustomerProfile(customer.customerId),
      getProducts(customer.customerId),
      getTransactions(customer.customerId),
    ]);
    res.json({
      customer: { customerId: customer.customerId, ...profile },
      products,
      transactions,
    });
  } catch (error) {
    console.error('[/api/products] Error reading bank data:', error);
    res.status(502).json({ error: 'Failed to read bank data' });
  }
});
