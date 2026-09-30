import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import {
  createUIMessageStream,
  type LanguageModelUsage,
  pipeUIMessageStreamToResponse,
} from 'ai';
import {
  authMiddleware,
  requireAuth,
  requireChatAccess,
  getIdFromRequest,
} from '../middleware/auth';
import {
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  reopenChat,
  saveChat,
  saveMessages,
  updateChatVisiblityById,
  updateChatCustomer,
  enqueueAgentTurn,
  hasPendingAgentTurn,
  hasOpenHandoff,
  isDatabaseAvailable,
} from '@chat-template/db';
import {
  type ChatMessage,
  checkChatAccess,
  convertToUIMessages,
  generateUUID,
  myProvider,
  postRequestBodySchema,
  type PostRequestBody,
  type VisibilityType,
  getAndClearAgentOutputs,
} from '@chat-template/core';
import { isAgentUnavailableError } from '@chat-template/ai-sdk-providers';
import { ChatSDKError } from '@chat-template/core/errors';
import { generateTitleFromUserMessage } from '../title';
import { toCustomerChat } from '../customer-view';
import { resolveSessionCustomer, tokenForCustomerId } from '../demo-customers';
import { resolveCustomerName } from '../customer-name';
import {
  persistAgentReply,
  streamAgentTurn,
  streamCache,
} from '../agent-reply';
import { isPaused } from '../agent-turn';

const CUSTOMER_ERROR_MESSAGE =
  'David no está disponible en este momento. Intenta de nuevo en unos segundos.';

export const chatRouter: RouterType = Router();

// Apply auth middleware to all chat routes
chatRouter.use(authMiddleware);

/**
 * POST /api/chat - Send a message and get streaming response
 *
 * Note: Works in ephemeral mode when database is disabled.
 * Streaming continues normally, but no chat/message persistence occurs.
 */
chatRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const startedAt = new Date();
  const dbAvailable = isDatabaseAvailable();
  if (!dbAvailable) {
    console.log('[Chat] Running in ephemeral mode - no persistence');
  }

  console.log(`CHAT POST REQUEST ${Date.now()}`);

  let requestBody: PostRequestBody;

  try {
    requestBody = postRequestBodySchema.parse(req.body);
  } catch (_) {
    console.error('Error parsing request body:', _);
    const error = new ChatSDKError('bad_request:api');
    const response = error.toResponse();
    return res.status(response.status).json(response.json);
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
      sessionToken,
      language: requestedLanguage,
    }: {
      id: string;
      message?: ChatMessage;
      selectedChatModel: string;
      selectedVisibilityType: VisibilityType;
      sessionToken?: string;
      language?: string;
    } = requestBody;
    // The customer's pick in the chat (ES | PT); anything else is ignored.
    const language =
      requestedLanguage === 'es' || requestedLanguage === 'pt'
        ? requestedLanguage
        : null;

    const session = req.session;
    if (!session) {
      const error = new ChatSDKError('unauthorized:chat');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    const { chat, allowed, reason } = await checkChatAccess(
      id,
      session?.user.id,
    );

    if (reason !== 'not_found' && !allowed) {
      const error = new ChatSDKError('forbidden:chat');
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    // The session's bank customer, kept on the chat for the console.
    const sessionCustomer = sessionToken
      ? await resolveSessionCustomer(sessionToken)
      : undefined;
    const customerId =
      sessionCustomer && !sessionCustomer.expired
        ? sessionCustomer.customerId
        : null;

    if (!chat) {
      // Only create new chat if we have a message (not a continuation)
      if (isDatabaseAvailable() && message) {
        const title = await generateTitleFromUserMessage({ message });

        await saveChat({
          id,
          userId: session.user.id,
          userEmail: session.user.email,
          title,
          visibility: selectedVisibilityType,
          customerId,
        });
      }
    } else {
      if (chat.userId !== session.user.id) {
        const error = new ChatSDKError('forbidden:chat');
        const response = error.toResponse();
        return res.status(response.status).json(response.json);
      }
      if (customerId && chat.customerId !== customerId) {
        await updateChatCustomer({ chatId: id, customerId });
      }
    }
    // One bank lookup per customer, not per turn: only while the name
    // is missing (new chat, new customer, or a lookup that failed before).
    // It doesn't hold up the reply.
    if (
      dbAvailable &&
      customerId &&
      (!chat || chat.customerId !== customerId || !chat.customerName)
    ) {
      void resolveCustomerName(customerId);
    }

    const messagesFromDb = await getMessagesByChatId({ id });

    // Use previousMessages from request body when:
    // 1. Ephemeral mode (DB not available) - always use client-side messages
    // 2. Continuation request (no message) - tool results only exist client-side
    const useClientMessages =
      !dbAvailable || (!message && requestBody.previousMessages);
    const previousMessages = useClientMessages
      ? (requestBody.previousMessages ?? [])
      : convertToUIMessages(messagesFromDb);

    // If message is provided, add it to the list and save it
    // If not (continuation/regeneration), just use previous messages
    // A client message reopens a closed chat: closing only means the agent
    // resolved it, not that the customer is done writing.
    if (dbAvailable && chat?.closedAt) {
      await reopenChat({ chatId: id });
    }

    let uiMessages: ChatMessage[];
    if (message) {
      // A retry (useChat regenerate) resends the same message id: it's
      // already stored, so it's upserted and not repeated in the history.
      uiMessages = [
        ...previousMessages.filter((m) => m.id !== message.id),
        message,
      ];
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: 'user',
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
            blocked: false,
            senderType: 'customer',
            senderId: null,
          },
        ],
      });
    } else {
      // Continuation: use existing messages without adding new user message
      uiMessages = previousMessages as ChatMessage[];

      // For continuations with database enabled, save any updated assistant messages
      // This ensures tool-result parts (like MCP approval responses) are persisted
      if (dbAvailable && requestBody.previousMessages) {
        const assistantMessages = requestBody.previousMessages.filter(
          (m: ChatMessage) => m.role === 'assistant',
        );
        if (assistantMessages.length > 0) {
          await saveMessages({
            messages: assistantMessages.map((m: ChatMessage) => ({
              chatId: id,
              id: m.id,
              role: m.role,
              parts: m.parts,
              attachments: [],
              createdAt: m.metadata?.createdAt
                ? new Date(m.metadata.createdAt)
                : new Date(),
              blocked: false,
              senderType: 'ai_agent' as const,
              senderId: null,
            })),
          });

          // Check if this is an MCP denial - if so, we're done (no need to call LLM)
          // Denial is indicated by a dynamic-tool part with state 'output-denied'
          // or with approval.approved === false
          const hasMcpDenial = requestBody.previousMessages?.some(
            (m: ChatMessage) =>
              m.parts?.some(
                (p) =>
                  p.type === 'dynamic-tool' &&
                  (p.state === 'output-denied' ||
                    ('approval' in p && p.approval?.approved === false)),
              ),
          );

          if (hasMcpDenial) {
            // We don't need to call the LLM because the user has denied the tool call
            res.end();
            return;
          }
        }
      }
    }

    // A human (queue or agent) owns this conversation, or a handoff is open:
    // the client message is saved above, but the agent never sees it. Respond
    // with just the conversation state so useChat doesn't treat the stream as
    // an error.
    if (
      dbAvailable &&
      chat &&
      isPaused({
        handledBy: chat.handledBy,
        hasOpenHandoff: await hasOpenHandoff({ chatId: id }),
      })
    ) {
      streamCache.clearActiveStream(id);
      const conversationStateStream = createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: 'start' });
          writer.write({
            type: 'data-conversation-state',
            data: { handledBy: chat.handledBy },
          });
          writer.write({ type: 'finish' });
        },
      });
      pipeUIMessageStreamToResponse({
        stream: conversationStateStream,
        response: res,
      });
      return;
    }

    // The chat's turns go one at a time: while David is still answering the
    // previous message, or a turn is waiting in the queue, this one is queued
    // too (the customer's message is never lost, and a handoff in the turn
    // ahead cancels it).
    if (
      dbAvailable &&
      message &&
      (streamCache.getActiveStreamId(id) ||
        (await hasPendingAgentTurn({ chatId: id })))
    ) {
      await enqueueAgentTurn({
        chatId: id,
        messageId: message.id,
        userId: session.user.email ?? session.user.id,
        sessionToken,
        language,
      });
      const pendingStream = createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: 'start' });
          writer.write({
            type: 'data-agent-pending',
            data: { messageId: message.id },
          });
          writer.write({ type: 'finish' });
        },
      });
      pipeUIMessageStreamToResponse({ stream: pendingStream, response: res });
      return;
    }

    let finalUsage: LanguageModelUsage | undefined;
    const streamId = generateUUID();
    // Set when the agent can't be reached (its App redeploying): the turn is
    // queued for the worker instead of failing (server/src/agent-queue.ts).
    let agentUnavailable = false;

    const result = await streamAgentTurn({
      chatId: id,
      userId: session.user.email ?? session.user.id,
      sessionToken,
      handledBy: chat?.handledBy ?? 'ai_agent',
      language,
      messages: uiMessages,
      selectedChatModel,
      onUsage: (usage) => {
        finalUsage = usage;
      },
    });

    /**
     * We manually create the stream to have access to the stream writer.
     * This allows us to inject custom stream parts like data-error.
     */
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const uiStream = result.toUIMessageStream({
          originalMessages: uiMessages,
          generateMessageId: generateUUID,
          sendReasoning: true,
          sendSources: true,
          onError: (error) => {
            if (dbAvailable && message && isAgentUnavailableError(error)) {
              agentUnavailable = true;
              return '';
            }
            console.error('Stream error:', error);
            // The customer never sees technical details.
            writer.write({ type: 'data-error', data: CUSTOMER_ERROR_MESSAGE });
            return CUSTOMER_ERROR_MESSAGE;
          },
        });
        // An unavailable agent ends as start + data-agent-pending + finish,
        // with no error part.
        let finished = false;
        writer.merge(
          uiStream.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                if (chunk.type === 'finish') finished = true;
                if (chunk.type === 'error' && agentUnavailable) {
                  controller.enqueue({
                    type: 'data-agent-pending',
                    data: { messageId: message?.id ?? '' },
                  });
                  return;
                }
                controller.enqueue(chunk);
              },
              flush(controller) {
                if (agentUnavailable && !finished) {
                  controller.enqueue({ type: 'finish' });
                }
              },
            }),
          ),
        );
      },
      onFinish: async ({ responseMessage }) => {
        if (agentUnavailable && message) {
          // Nothing is saved for David: the worker answers when he's back.
          getAndClearAgentOutputs(id);
          await enqueueAgentTurn({
            chatId: id,
            messageId: message.id,
            userId: session.user.email ?? session.user.id,
            sessionToken,
            language,
          });
          streamCache.clearActiveStream(id);
          return;
        }

        console.log(
          'Finished message stream! Saving message...',
          JSON.stringify(responseMessage, null, 2),
        );

        if (dbAvailable) {
          await persistAgentReply({
            chatId: id,
            customerMessageId: message?.id,
            reply: responseMessage,
            usage: finalUsage,
            startedAt,
            source: 'live',
          });
        } else {
          getAndClearAgentOutputs(id);
        }

        streamCache.clearActiveStream(id);
      },
    });

    pipeUIMessageStreamToResponse({
      stream,
      response: res,
      consumeSseStream({ stream }) {
        streamCache.storeStream({
          streamId,
          chatId: id,
          stream,
        });
      },
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      const response = error.toResponse();
      return res.status(response.status).json(response.json);
    }

    console.error('Unhandled error in chat API:', error);

    const chatError = new ChatSDKError('offline:chat');
    const response = chatError.toResponse();
    return res.status(response.status).json(response.json);
  }
});

/**
 * DELETE /api/chat?id=:id - Delete a chat
 */
chatRouter.delete(
  '/:id',
  [requireAuth, requireChatAccess],
  async (req: Request, res: Response) => {
    const id = getIdFromRequest(req);
    if (!id) return;

    const deletedChat = await deleteChatById({ id });
    return res.status(200).json(deletedChat);
  },
);

/**
 * GET /api/chat/:id
 */

chatRouter.get(
  '/:id',
  [requireAuth, requireChatAccess],
  async (req: Request, res: Response) => {
    const id = getIdFromRequest(req);
    if (!id) return;

    const { chat } = await checkChatAccess(id, req.session?.user.id);

    if (!chat) return res.status(200).json(chat);
    // agentPending: a customer turn is waiting for the agent to come back.
    return res.status(200).json({
      ...toCustomerChat(chat),
      agentPending: await hasPendingAgentTurn({ chatId: chat.id }),
      demoCustomerToken: chat.customerId
        ? (tokenForCustomerId(chat.customerId) ?? null)
        : null,
    });
  },
);

/**
 * GET /api/chat/:id/stream - Resume a stream
 */
chatRouter.get(
  '/:id/stream',
  [requireAuth],
  async (req: Request, res: Response) => {
    const chatId = getIdFromRequest(req);
    if (!chatId) return;
    const cursor = req.headers['x-resume-stream-cursor'] as string;

    console.log(`[Stream Resume] Cursor: ${cursor}`);

    console.log(`[Stream Resume] GET request for chat ${chatId}`);

    // Check if there's an active stream for this chat first
    const streamId = streamCache.getActiveStreamId(chatId);

    if (!streamId) {
      console.log(`[Stream Resume] No active stream for chat ${chatId}`);
      const streamError = new ChatSDKError('empty:stream');
      const response = streamError.toResponse();
      return res.status(response.status).json(response.json);
    }

    const { allowed, reason } = await checkChatAccess(
      chatId,
      req.session?.user.id,
    );

    // If chat doesn't exist in DB, it's a temporary chat from the homepage - allow it
    if (reason === 'not_found') {
      console.log(
        `[Stream Resume] Resuming stream for temporary chat ${chatId} (not yet in DB)`,
      );
    } else if (!allowed) {
      console.log(
        `[Stream Resume] User ${req.session?.user.id} does not have access to chat ${chatId} (reason: ${reason})`,
      );
      const streamError = new ChatSDKError('forbidden:chat', reason);
      const response = streamError.toResponse();
      return res.status(response.status).json(response.json);
    }

    // Get all cached chunks for this stream
    const stream = streamCache.getStream(streamId, {
      cursor: cursor ? Number.parseInt(cursor) : undefined,
    });

    if (!stream) {
      console.log(`[Stream Resume] No stream found for ${streamId}`);
      const streamError = new ChatSDKError('empty:stream');
      const response = streamError.toResponse();
      return res.status(response.status).json(response.json);
    }

    console.log(`[Stream Resume] Resuming stream ${streamId}`);

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Pipe the cached stream directly to the response
    stream.pipe(res);

    // Handle stream errors
    stream.on('error', (error) => {
      console.error('[Stream Resume] Stream error:', error);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
  },
);

/**
 * POST /api/chat/title - Generate title from message
 */
chatRouter.post('/title', requireAuth, async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const title = await generateTitleFromUserMessage({ message });
    res.json({ title });
  } catch (error) {
    console.error('Error generating title:', error);
    res.status(500).json({ error: 'Failed to generate title' });
  }
});

/**
 * PATCH /api/chat/:id/visibility - Update chat visibility
 */
chatRouter.patch(
  '/:id/visibility',
  [requireAuth, requireChatAccess],
  async (req: Request, res: Response) => {
    try {
      const id = getIdFromRequest(req);
      if (!id) return;
      const { visibility } = req.body;

      if (!visibility || !['public', 'private'].includes(visibility)) {
        return res.status(400).json({ error: 'Invalid visibility type' });
      }

      await updateChatVisiblityById({ chatId: id, visibility });
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating visibility:', error);
      res.status(500).json({ error: 'Failed to update visibility' });
    }
  },
);
