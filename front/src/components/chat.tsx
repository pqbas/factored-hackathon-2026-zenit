import type { DataUIPart, LanguageModelUsage, UIMessageChunk } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import { fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type {
  Attachment,
  ChatMessage,
  CustomUIDataTypes,
  VisibilityType,
} from '@chat-template/core';
import { chatHistoryCacheKey } from './sidebar-history';
import { toast } from './toast';
import { useSearchParams } from 'react-router-dom';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { ChatSDKError } from '@chat-template/core/errors';
import { useDataStream } from './data-stream-provider';
import { isCredentialErrorMessage } from '@/lib/oauth-error-utils';
import { ChatTransport } from '../lib/ChatTransport';
import type { ClientSession } from '@chat-template/auth';
import { softNavigateToChatId } from '@/lib/navigation';
import { useAppConfig } from '@/contexts/AppConfigContext';
import { useLang } from '@/contexts/LangContext';
import { useDemoCustomers } from '@/hooks/use-demo-customers';
import { useHandoff } from '@/hooks/use-handoff';
import {
  type HandledBy,
  handledByOf,
  AGENT_PENDING_EVENT,
  handoffNotice,
  isStateOnlyMessage,
} from '@/lib/handoff';
import {
  chatCustomerToken,
  chooseCustomerToken,
  getChatCustomerToken,
  getLastCustomerToken,
  pickDefaultToken,
  setChatCustomerToken,
  getActiveCustomerToken,
  setActiveCustomerToken,
} from '@/lib/demo-customer-storage';

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  initialLastContext,
  initialHandledBy = 'ai_agent',
  initialAgentPending = false,
  initialCustomerToken = null,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: ClientSession;
  initialLastContext?: LanguageModelUsage;
  initialHandledBy?: HandledBy;
  initialAgentPending?: boolean;
  // The customer the back stored for this chat, when it has one.
  initialCustomerToken?: string | null;
}) {
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();
  const { setDataStream } = useDataStream();
  const { chatHistoryEnabled } = useAppConfig();

  const [input, setInput] = useState<string>('');
  const [_usage, setUsage] = useState<LanguageModelUsage | undefined>(
    initialLastContext,
  );

  // Demo customer this chat talks as. It is fixed once the first message
  // goes out, because the agent keys its memory on the chat id.
  const { customers } = useDemoCustomers();
  const [customerToken, setCustomerToken] = useState<string | null>(() =>
    chatCustomerToken(id, initialCustomerToken),
  );
  const [isCustomerLocked, setIsCustomerLocked] = useState(
    () => initialMessages.length > 0 && chatCustomerToken(id, initialCustomerToken) !== null,
  );
  const customerTokenRef = useRef(customerToken);
  customerTokenRef.current = customerToken;
  // The chosen language goes with every message, for David to answer in it
  // when the message doesn't make it clear (custom_inputs.language).
  const { lang } = useLang();
  const langRef = useRef(lang);
  langRef.current = lang;
  useEffect(() => {
    if (customerToken === null && customers.length > 0) {
      const picked = pickDefaultToken(customers, getLastCustomerToken());
      setCustomerToken(picked);
      // Nothing picked yet this session: the default is the session's customer.
      if (picked && getActiveCustomerToken() === null) setActiveCustomerToken(picked);
    }
  }, [customers, customerToken]);

  const [streamCursor, setStreamCursor] = useState(0);
  const streamCursorRef = useRef(streamCursor);
  streamCursorRef.current = streamCursor;
  const [lastPart, setLastPart] = useState<UIMessageChunk | undefined>();
  const lastPartRef = useRef<UIMessageChunk | undefined>(lastPart);
  lastPartRef.current = lastPart;

  // Single counter for resume attempts - reset when stream parts are received
  const resumeAttemptCountRef = useRef(0);
  const maxResumeAttempts = 3;

  const abortController = useRef<AbortController | null>(new AbortController());
  useEffect(() => {
    return () => {
      abortController.current?.abort('ABORT_SIGNAL');
    };
  }, []);

  const fetchWithAbort = useMemo(() => {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      // useChat does not cancel /stream requests when the component is unmounted
      const signal = abortController.current?.signal;
      return fetchWithErrorHandlers(input, { ...init, signal });
    };
  }, []);

  const stop = useCallback(() => {
    abortController.current?.abort('USER_ABORT_SIGNAL');
  }, []);

  const isNewChat = initialMessages.length === 0;
  const didFetchHistoryOnNewChat = useRef(false);
  const fetchChatHistory = useCallback(() => {
    mutate(chatHistoryCacheKey());
  }, [mutate]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    resumeStream,
    clearError,
    addToolApprovalResponse,
    regenerate,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    resume: id !== undefined && initialMessages.length > 0, // Enable automatic stream resumption
    transport: new ChatTransport({
      onStreamPart: (part) => {
        // As soon as we recive a stream part, we fetch the chat history again for new chats
        if (isNewChat && !didFetchHistoryOnNewChat.current) {
          fetchChatHistory();
          didFetchHistoryOnNewChat.current = true;
        }
        // Reset resume attempts when we successfully receive stream parts
        resumeAttemptCountRef.current = 0;

        // Keep track of the number of stream parts received
        setStreamCursor((cursor) => cursor + 1);
        setLastPart(part);
      },
      api: '/api/chat',
      fetch: fetchWithAbort,
      prepareSendMessagesRequest({ messages, id, body }) {
        const lastMessage = messages.at(-1);
        const isUserMessage = lastMessage?.role === 'user';

        // For continuations (non-user messages like tool results), we must always
        // send previousMessages because the tool result only exists client-side
        // and hasn't been saved to the database yet.
        const needsPreviousMessages = !chatHistoryEnabled || !isUserMessage;

        const sessionToken = customerTokenRef.current;
        if (sessionToken && isUserMessage && getChatCustomerToken(id) === null) {
          setChatCustomerToken(id, sessionToken);
          setIsCustomerLocked(true);
        }

        return {
          body: {
            id,
            // Only include message field for user messages (new messages)
            // For continuation (assistant messages with tool results), omit message field
            ...(isUserMessage ? { message: lastMessage } : {}),
            selectedChatModel: initialChatModel,
            selectedVisibilityType: visibilityType,
            nextMessageId: generateUUID(),
            // Never an empty string: the back rejects it.
            ...(sessionToken ? { sessionToken } : {}),
            language: langRef.current,
            // Send previous messages when:
            // 1. Database is disabled (ephemeral mode) - always need client-side messages
            // 2. Continuation request (tool results) - tool result only exists client-side
            ...(needsPreviousMessages
              ? {
                  previousMessages: isUserMessage
                    ? messages.slice(0, -1)
                    : messages,
                }
              : {}),
            ...body,
          },
        };
      },
      prepareReconnectToStreamRequest({ id }) {
        return {
          api: `/api/chat/${id}/stream`,
          credentials: 'include',
          headers: {
            // Pass the cursor to the server so it can resume the stream from the correct point
            'X-Resume-Stream-Cursor': streamCursorRef.current.toString(),
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) =>
        ds ? [...ds, dataPart as DataUIPart<CustomUIDataTypes>] : [],
      );
      if (dataPart.type === 'data-usage') {
        setUsage(dataPart.data as LanguageModelUsage);
      }
      // A person handles this chat: the back answered with just the state.
      if (dataPart.type === 'data-conversation-state') {
        setHandledBy(
          handledByOf((dataPart.data as { handledBy?: string }).handledBy),
        );
      }
      // The agent is unavailable: the back queued this turn.
      if (dataPart.type === AGENT_PENDING_EVENT) setAgentPending(true);
    },
    onFinish: ({
      isAbort,
      isDisconnect,
      isError,
      messages: finishedMessages,
    }) => {
      // Reset state for next message
      didFetchHistoryOnNewChat.current = false;

      // Drop the empty assistant message a state-only answer leaves behind,
      // and re-read who handles the chat: the agent may have just handed it
      // off to an advisor.
      setMessages((current) =>
        isStateOnlyMessage(current.at(-1)) ? current.slice(0, -1) : current,
      );
      if (chatHistoryEnabled && !isAbort) refreshState();

      // If user aborted, don't try to resume
      if (isAbort) {
        console.log('[Chat onFinish] Stream was aborted by user, not resuming');
        setStreamCursor(0);
        fetchChatHistory();
        return;
      }

      // Check if the last message contains an OAuth credential error
      // If so, don't try to resume - the user needs to authenticate first
      const lastMessage = finishedMessages?.at(-1);
      const hasOAuthError = lastMessage?.parts?.some(
        (part) =>
          part.type === 'data-error' &&
          typeof part.data === 'string' &&
          isCredentialErrorMessage(part.data),
      );

      if (hasOAuthError) {
        console.log(
          '[Chat onFinish] OAuth credential error detected, not resuming',
        );
        setStreamCursor(0);
        fetchChatHistory();
        clearError();
        return;
      }

      // Determine if we should attempt to resume:
      // 1. Stream didn't end with a 'finish' part (incomplete)
      // 2. It was a disconnect/error that terminated the stream
      // 3. We haven't exceeded max resume attempts
      const streamIncomplete = lastPartRef.current?.type !== 'finish';
      const shouldResume =
        streamIncomplete &&
        (isDisconnect || isError || lastPartRef.current === undefined);

      if (shouldResume && resumeAttemptCountRef.current < maxResumeAttempts) {
        console.log(
          '[Chat onFinish] Resuming stream. Attempt:',
          resumeAttemptCountRef.current + 1,
        );
        resumeAttemptCountRef.current++;
        resumeStream();
      } else {
        // Stream completed normally or we've exhausted resume attempts
        if (resumeAttemptCountRef.current >= maxResumeAttempts) {
          console.warn('[Chat onFinish] Max resume attempts reached');
        }
        setStreamCursor(0);
        fetchChatHistory();
      }
    },
    onError: (error) => {
      console.log('[Chat onError] Error occurred:', error);

      // Only show toast for explicit ChatSDKError (backend validation errors)
      // Other errors (network, schema validation) are handled silently or in message parts
      // Failures on David's side (unavailable, offline, gateway) show inline
      // as a friendly note; only the customer's own problems (validation,
      // permissions, limits) get a toast.
      const inline =
        !(error instanceof ChatSDKError) ||
        !['bad_request', 'unauthorized', 'forbidden', 'not_found', 'rate_limit', 'conflict'].includes(
          error.type,
        );
      if (!inline) {
        toast({
          type: 'error',
          description: error.message,
        });
      } else {
        console.warn('[Chat onError] Error during streaming:', error.message);
      }
      // Note: We don't call resumeStream here because onError can be called
      // while the stream is still active (e.g., for data-error parts).
      // Resume logic is handled exclusively in onFinish.
    },
  });

  const { handledBy, setHandledBy, agentPending, setAgentPending, refreshState } = useHandoff({
    chatId: id,
    initialHandledBy,
    initialAgentPending,
    messages,
    setMessages,
    enabled: chatHistoryEnabled,
  });
  const notice = handoffNotice(handledBy, lang);

  const [searchParams] = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: 'user' as const,
        parts: [{ type: 'text', text: query }],
      });

      setHasAppendedQuery(true);
      softNavigateToChatId(id, chatHistoryEnabled);
    }
  }, [query, sendMessage, hasAppendedQuery, id, chatHistoryEnabled]);

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  return (
    <>
      <div className="overscroll-behavior-contain flex h-full min-w-0 touch-pan-y flex-col bg-background">
        <ChatHeader
          chatId={id}
          customers={customers}
          customerToken={customerToken}
          onCustomerChange={(t) => {
            setCustomerToken(t);
            chooseCustomerToken(t);
          }}
          isCustomerLocked={isCustomerLocked}
          handledBy={handledBy}
          agentPending={agentPending}
        />

        <Messages
          chatId={id}
          status={status}
          messages={messages}
          setMessages={setMessages}
          addToolApprovalResponse={addToolApprovalResponse}
          regenerate={regenerate}
          sendMessage={sendMessage}
          isReadonly={isReadonly}
          selectedModelId={initialChatModel}
          handledBy={handledBy}
          agentPending={agentPending}
        />

        {notice && (
          <div
            data-testid="handoff-notice"
            className="mx-auto flex w-full max-w-4xl items-center justify-center gap-1.5 px-4 pb-1 text-muted-foreground text-xs"
          >
            <UserRound className="size-3.5 text-primary" strokeWidth={2} />
            {notice}
          </div>
        )}
        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              sendMessage={sendMessage}
              selectedVisibilityType={visibilityType}
            />
          )}
        </div>
      </div>
    </>
  );
}
