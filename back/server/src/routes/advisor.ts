import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { z } from 'zod';
import {
  authMiddleware,
  requireAuth,
  requireAdvisor,
  requireAdmin,
  getIdFromRequest,
} from '../middleware/auth';
import {
  getChats,
  getChatOwners,
  getConversationCounts,
  getResolutionMetrics,
  HUMAN_HANDLED_BY,
  getLastCustomerMessages,
  getChatById,
  getMessagesAfter,
  takeChat,
  releaseChat,
  saveMessages,
  isDatabaseAvailable,
} from '@chat-template/db';
import { generateUUID } from '@chat-template/core';
import { ChatSDKError } from '@chat-template/core/errors';
import { normalizeEmail } from '../roles';
import { toLastMessagePreview } from '../inbox';

export const advisorRouter: RouterType = Router();

advisorRouter.use(authMiddleware);
advisorRouter.use(requireAuth, requireAdvisor);

// System messages: visible to the customer, never mention the advisor's email.
const SYSTEM_MESSAGES = {
  taken: 'Te atiende un asesor.',
  returned_to_agent: 'Volviste con David.',
  resolved: 'La conversación se cerró.',
} as const;

async function saveSystemMessage({
  chatId,
  text,
}: {
  chatId: string;
  text: string;
}) {
  await saveMessages({
    messages: [
      {
        id: generateUUID(),
        chatId,
        role: 'system',
        parts: [{ type: 'text', text }],
        attachments: [],
        createdAt: new Date(),
        blocked: false,
        senderType: 'system',
        senderId: null,
      },
    ],
  });
}

const messageBodySchema = z.object({
  text: z.string().min(1).max(4000),
});

const releaseBodySchema = z.object({
  outcome: z.enum(['returned_to_agent', 'resolved']),
  note: z.string().optional(),
});

/**
 * GET /api/advisor/conversations - Advisor/admin inbox, same pagination as /api/history.
 */
advisorRouter.get('/conversations', async (req: Request, res: Response) => {
  if (!isDatabaseAvailable()) {
    return res.status(204).end();
  }

  const limit = Number.parseInt((req.query.limit as string) || '10');
  const startingAfter = req.query.starting_after as string | undefined;
  const endingBefore = req.query.ending_before as string | undefined;
  // Without handledBy, the inbox is the human cases only (open). David's chats
  // come with handledBy=ai_agent; the closed view keeps every resolved chat,
  // since resolving hands the chat back to ai_agent.
  const handledByParam = req.query.handledBy as string | undefined;
  const statusParam = req.query.status as 'open' | 'closed' | undefined;
  const humanInbox = !handledByParam && statusParam !== 'closed';
  const handledBy = humanInbox ? HUMAN_HANDLED_BY : handledByParam;
  const status = humanInbox ? 'open' : statusParam;
  const useCase = req.query.useCase as string | undefined;
  const userId = req.query.userId as string | undefined;
  const assignedToParam = req.query.assignedTo as string | undefined;
  const assignedTo =
    normalizeEmail(
      assignedToParam === 'me' ? req.session?.user.email : assignedToParam,
    );

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
      handledBy,
      useCase,
      assignedTo,
      status,
    });

    const lastMessages = await getLastCustomerMessages({
      chatIds: chats.chats.map((c) => c.id),
    });
    const lastByChat = new Map(lastMessages.map((m) => [m.chatId, m]));

    res.json({
      ...chats,
      chats: chats.chats.map((c) => {
        const last = lastByChat.get(c.id);
        return { ...c, lastMessage: last ? toLastMessagePreview(last) : null };
      }),
    });
  } catch (error) {
    console.error('[/api/advisor/conversations] Error in handler:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /api/advisor/conversations/:id/messages?after=<id>
 */
advisorRouter.get(
  '/conversations/:id/messages',
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

      const after = req.query.after as string | undefined;
      const messages = await getMessagesAfter({ chatId: id, afterId: after });
      if (messages === null) {
        const error = new ChatSDKError(
          'bad_request:api',
          'The after message does not exist in this chat.',
        );
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      res.json(messages);
    } catch (error) {
      console.error(
        '[/api/advisor/conversations/:id/messages] Error in handler:',
        error,
      );
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  },
);

/**
 * GET /api/advisor/conversations/counts - Counts for the console's view bar.
 */
advisorRouter.get(
  '/conversations/counts',
  async (req: Request, res: Response) => {
    if (!isDatabaseAvailable()) {
      return res.status(204).end();
    }

    const email = normalizeEmail(req.session?.user.email);
    try {
      res.json(
        await getConversationCounts({
          userId: (req.query.userId as string | undefined) || undefined,
          advisorEmail: email,
        }),
      );
    } catch (error) {
      console.error('[/api/advisor/conversations/counts] Error:', error);
      res.status(500).json({ error: 'Failed to count conversations' });
    }
  },
);

/**
 * GET /api/advisor/users - Users with at least one chat, for the admin's
 * customer filter. Admin only: it is for supervising.
 */
advisorRouter.get('/users', requireAdmin, async (_req: Request, res: Response) => {
  if (!isDatabaseAvailable()) {
    return res.status(204).end();
  }

  try {
    res.json({ users: await getChatOwners() });
  } catch (error) {
    console.error('[/api/advisor/users] Error in handler:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

const metricsQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

/**
 * GET /api/advisor/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD - Resolution metrics
 * (docs/flujo-atencion.md §6). Admin only. Both dates inclusive, in UTC.
 */
advisorRouter.get(
  '/metrics',
  requireAdmin,
  async (req: Request, res: Response) => {
    if (!isDatabaseAvailable()) {
      return res.status(204).end();
    }

    const query = metricsQuerySchema.safeParse(req.query);
    if (!query.success) {
      const error = new ChatSDKError(
        'bad_request:api',
        'from and to must be YYYY-MM-DD dates.',
      );
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    try {
      res.json(await getResolutionMetrics(query.data));
    } catch (error) {
      console.error('[/api/advisor/metrics] Error in handler:', error);
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  },
);

/**
 * POST /api/advisor/conversations/:id/take
 */
advisorRouter.post(
  '/conversations/:id/take',
  async (req: Request, res: Response) => {
    if (!isDatabaseAvailable()) {
      return res.status(204).end();
    }

    const id = getIdFromRequest(req);
    if (!id) return;

    const email = normalizeEmail(req.session?.user.email);
    if (!email) {
      const response = new ChatSDKError('unauthorized:chat').toResponse();
      return res.status(response.status).json(response.json);
    }

    try {
      const result = await takeChat({ chatId: id, advisorEmail: email });

      if (result.outcome === 'not_found') {
        const error = new ChatSDKError('not_found:chat');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      if (result.outcome === 'conflict') {
        const error = new ChatSDKError('conflict:chat');
        const response = error.toResponse();
        return res
          .status(response.status)
          .json({ ...response.json, assignedTo: result.assignedTo });
      }

      if (!result.alreadyMine) {
        await saveSystemMessage({ chatId: id, text: SYSTEM_MESSAGES.taken });
      }

      res.json({ chat: result.chat });
    } catch (error) {
      console.error(
        '[/api/advisor/conversations/:id/take] Error in handler:',
        error,
      );
      res.status(500).json({ error: 'Failed to take conversation' });
    }
  },
);

/**
 * POST /api/advisor/conversations/:id/messages
 */
advisorRouter.post(
  '/conversations/:id/messages',
  async (req: Request, res: Response) => {
    if (!isDatabaseAvailable()) {
      return res.status(204).end();
    }

    const id = getIdFromRequest(req);
    if (!id) return;

    const email = normalizeEmail(req.session?.user.email);
    if (!email) {
      const response = new ChatSDKError('unauthorized:chat').toResponse();
      return res.status(response.status).json(response.json);
    }

    let body: z.infer<typeof messageBodySchema>;
    try {
      body = messageBodySchema.parse(req.body);
    } catch {
      const error = new ChatSDKError('bad_request:api');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    try {
      const chat = await getChatById({ id });
      if (!chat) {
        const error = new ChatSDKError('not_found:chat');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      if (chat.handledBy !== 'human_agent' || chat.assignedTo !== email) {
        const error = new ChatSDKError('conflict:chat');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      const newMessage = {
        id: generateUUID(),
        chatId: id,
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: body.text }],
        attachments: [],
        createdAt: new Date(),
        blocked: false,
        senderType: 'human_agent' as const,
        senderId: email,
      };

      await saveMessages({ messages: [newMessage] });

      res.status(201).json({ message: newMessage });
    } catch (error) {
      console.error(
        '[/api/advisor/conversations/:id/messages] Error in handler:',
        error,
      );
      res.status(500).json({ error: 'Failed to send message' });
    }
  },
);

/**
 * POST /api/advisor/conversations/:id/release
 */
advisorRouter.post(
  '/conversations/:id/release',
  async (req: Request, res: Response) => {
    if (!isDatabaseAvailable()) {
      return res.status(204).end();
    }

    const id = getIdFromRequest(req);
    if (!id) return;

    const email = normalizeEmail(req.session?.user.email);
    if (!email) {
      const response = new ChatSDKError('unauthorized:chat').toResponse();
      return res.status(response.status).json(response.json);
    }

    let body: z.infer<typeof releaseBodySchema>;
    try {
      body = releaseBodySchema.parse(req.body);
    } catch {
      const error = new ChatSDKError('bad_request:api');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    try {
      const chat = await getChatById({ id });
      if (!chat) {
        const error = new ChatSDKError('not_found:chat');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      if (chat.handledBy !== 'human_agent' || chat.assignedTo !== email) {
        const error = new ChatSDKError('conflict:chat');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }

      const updatedChat = await releaseChat({
        chatId: id,
        outcome: body.outcome,
      });
      await saveSystemMessage({
        chatId: id,
        text: SYSTEM_MESSAGES[body.outcome],
      });

      res.json({ chat: updatedChat });
    } catch (error) {
      console.error(
        '[/api/advisor/conversations/:id/release] Error in handler:',
        error,
      );
      res.status(500).json({ error: 'Failed to release conversation' });
    }
  },
);
