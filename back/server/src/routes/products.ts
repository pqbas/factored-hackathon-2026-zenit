import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { ChatSDKError } from '@chat-template/core/errors';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { getRole } from '../roles';
import { resolveSessionCustomer } from '../demo-customers';
import {
  getCustomerProfile,
  getProducts,
  getSavingsHistory,
  getTransactions,
} from '../bank-data';

export const productsRouter: RouterType = Router();

productsRouter.use(authMiddleware);

// The customer of the request's sessionToken, or null once it has answered
// the error: 403 for the advisor (who doesn't see "Mis productos"), 400
// without token, 401 with reason for an unknown or expired one.
async function sessionCustomer(req: Request, res: Response) {
  if (getRole(req.session?.user.email) === 'advisor') {
    const response = new ChatSDKError('forbidden:chat').toResponse();
    res.status(response.status).json(response.json);
    return null;
  }

  const token = req.query.sessionToken;
  if (typeof token !== 'string' || !token) {
    const response = new ChatSDKError(
      'bad_request:api',
      'sessionToken is required.',
    ).toResponse();
    res.status(response.status).json(response.json);
    return null;
  }

  const customer = await resolveSessionCustomer(token);
  if (!customer || customer.expired) {
    const response = new ChatSDKError('unauthorized:chat').toResponse();
    res.status(response.status).json({
      ...response.json,
      reason: customer ? 'expired' : 'invalid',
    });
    return null;
  }
  return customer;
}

/**
 * GET /api/products?sessionToken= - The session customer's active products and
 * latest movements, read from the bank's data in Lakebase. Customer or admin only
 * (the advisor doesn't see "Mis productos").
 */
productsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const customer = await sessionCustomer(req, res);
  if (!customer) return;

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

/**
 * GET /api/products/savings-history?sessionToken= - The session customer's
 * savings per currency, one point per month of the last 12, rebuilt backwards
 * from today's balance (estimated: only today's point is real). A currency
 * whose rebuilt balance goes negative is left out.
 */
productsRouter.get(
  '/savings-history',
  requireAuth,
  async (req: Request, res: Response) => {
    const customer = await sessionCustomer(req, res);
    if (!customer) return;

    try {
      res.json({
        estimated: true,
        series: await getSavingsHistory(customer.customerId),
      });
    } catch (error) {
      console.error(
        '[/api/products/savings-history] Error reading bank data:',
        error,
      );
      res.status(502).json({ error: 'Failed to read bank data' });
    }
  },
);
