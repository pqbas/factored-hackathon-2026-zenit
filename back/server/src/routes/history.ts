import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { authMiddleware, requireAuth } from '../middleware/auth';
import { getChats, isDatabaseAvailable } from '@chat-template/db';
import { ChatSDKError } from '@chat-template/core/errors';

import { toCustomerChat } from '../customer-view';
import { resolveSessionCustomer } from '../demo-customers';

export const historyRouter: RouterType = Router();

// Apply auth middleware
historyRouter.use(authMiddleware);

/**
 * GET /api/history - Get chat history for authenticated user. With
 * ?sessionToken=, only the chats of that demo customer.
 */
historyRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  console.log('[/api/history] Handler called');

  // Return 204 No Content if database is not available
  const dbAvailable = isDatabaseAvailable();
  console.log('[/api/history] Database available:', dbAvailable);

  if (!dbAvailable) {
    console.log('[/api/history] Returning 204 No Content');
    return res.status(204).end();
  }

  const session = req.session;
  if (!session) {
    const error = new ChatSDKError('unauthorized:chat');
    const response = error.toResponse();
    return res.status(response.status).json(response.json);
  }

  const limit = Number.parseInt((req.query.limit as string) || '10');
  const startingAfter = req.query.starting_after as string | undefined;
  const endingBefore = req.query.ending_before as string | undefined;
  const handledBy = req.query.handledBy as string | undefined;
  const intent = req.query.intent as string | undefined;
  const useCase = req.query.useCase as string | undefined;
  const sessionToken = req.query.sessionToken as string | undefined;

  if (startingAfter && endingBefore) {
    const error = new ChatSDKError(
      'bad_request:api',
      'Only one of starting_after or ending_before can be provided.',
    );
    const response = error.toResponse();
    return res.status(response.status).json(response.json);
  }

  // An unknown or expired token lists nothing rather than failing: the
  // history doesn't depend on the session still being valid.
  const customer = sessionToken
    ? await resolveSessionCustomer(sessionToken)
    : undefined;
  if (sessionToken && (!customer || customer.expired)) {
    return res.json({ chats: [], hasMore: false });
  }

  try {
    const chats = await getChats({
      scope: { userId: session.user.id },
      customerId: customer?.customerId,
      limit,
      startingAfter: startingAfter ?? null,
      endingBefore: endingBefore ?? null,
      handledBy,
      intent,
      useCase,
    });

    res.json({ ...chats, chats: chats.chats.map(toCustomerChat) });
  } catch (error) {
    console.error('[/api/history] Error in handler:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});
