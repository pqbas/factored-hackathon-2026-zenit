import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import {
  authMiddleware,
  requireAuth,
  requireAdmin,
  getIdFromRequest,
} from '../middleware/auth';
import {
  getChats,
  getChatOwners,
  getChatById,
  getMessagesByChatId,
  isDatabaseAvailable,
  type ChatStatusFilter,
} from '@chat-template/db';
import { ChatSDKError } from '@chat-template/core/errors';

export const adminRouter: RouterType = Router();

// Apply auth middleware
adminRouter.use(authMiddleware);

/**
 * GET /api/admin/chats - Get chat history for all users, or one user via ?userId=
 */
adminRouter.get(
  '/chats',
  [requireAuth, requireAdmin],
  async (req: Request, res: Response) => {
    if (!isDatabaseAvailable()) {
      return res.status(204).end();
    }

    const limit = Number.parseInt((req.query.limit as string) || '10');
    const startingAfter = req.query.starting_after as string | undefined;
    const endingBefore = req.query.ending_before as string | undefined;
    const status = req.query.status as ChatStatusFilter | undefined;
    const intent = req.query.intent as string | undefined;
    const customer = req.query.customer as string | undefined;
    const userId = req.query.userId as string | undefined;

    if (startingAfter && endingBefore) {
      const error = new ChatSDKError(
        'bad_request:api',
        'Only one of starting_after or ending_before can be provided.',
      );
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    try {
      const chats = await getChats({
        scope: userId ? { userId } : 'all',
        limit,
        startingAfter: startingAfter ?? null,
        endingBefore: endingBefore ?? null,
        status,
        intent,
        customer,
      });

      res.json(chats);
    } catch (error) {
      console.error('[/api/admin/chats] Error in handler:', error);
      res.status(500).json({ error: 'Failed to fetch chats' });
    }
  },
);

/**
 * GET /api/admin/users - List users that own at least one chat
 */
adminRouter.get(
  '/users',
  [requireAuth, requireAdmin],
  async (_req: Request, res: Response) => {
    if (!isDatabaseAvailable()) {
      return res.status(204).end();
    }

    try {
      res.json({ users: await getChatOwners() });
    } catch (error) {
      console.error('[/api/admin/users] Error in handler:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  },
);

/**
 * GET /api/admin/chats/:id/messages - Get messages for any chat, private or not
 */
adminRouter.get(
  '/chats/:id/messages',
  [requireAuth, requireAdmin],
  async (req: Request, res: Response) => {
    if (!isDatabaseAvailable()) {
      return res.status(204).end();
    }

    const id = getIdFromRequest(req);
    if (!id) return;

    try {
      const chat = await getChatById({ id });
      if (!chat) {
        const error = new ChatSDKError('not_found:chat');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      const messages = await getMessagesByChatId({ id });
      res.json(messages);
    } catch (error) {
      console.error('[/api/admin/chats/:id/messages] Error in handler:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  },
);
