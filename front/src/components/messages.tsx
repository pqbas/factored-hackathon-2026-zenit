import { type HandledBy, isAwaitingDavid, senderOf } from '@/lib/handoff';
import { getTextFromMessage } from '@/lib/utils';
import { PreviewMessage, AwaitingResponseMessage } from './message';
import { Greeting } from './greeting';
import { AgentUnavailable } from './agent-unavailable';
import { BrandMark } from './brand-mark';
import { memo, useEffect } from 'react';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import { useMessages } from '@/hooks/use-messages';
import type { ChatMessage } from '@chat-template/core';
import { useDataStream } from './data-stream-provider';
import { Conversation, ConversationContent } from './elements/conversation';
import { ArrowDownIcon } from 'lucide-react';

interface MessagesProps {
  chatId: string;
  status: UseChatHelpers<ChatMessage>['status'];
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>['addToolApprovalResponse'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  selectedModelId: string;
  // Who handles the chat, and whether a turn waits in the queue: they decide
  // the "David está escribiendo" indicator.
  handledBy?: HandledBy;
  agentPending?: boolean;
}

function PureMessages({
  chatId,
  status,
  messages,
  setMessages,
  addToolApprovalResponse,
  sendMessage,
  regenerate,
  isReadonly,
  selectedModelId,
  handledBy = 'ai_agent',
  agentPending = false,
}: MessagesProps) {
  const awaiting = isAwaitingDavid({ status, messages, handledBy, agentPending });
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  useDataStream();

  useEffect(() => {
    if (status === 'submitted') {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth',
          });
        }
      });
    }
  }, [status, messagesContainerRef]);

  return (
    <div
      ref={messagesContainerRef}
      className="overscroll-behavior-contain -webkit-overflow-scrolling-touch flex-1 touch-pan-y overflow-y-scroll"
      style={{ overflowAnchor: 'none' }}
    >
      <Conversation className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 md:gap-6">
        <ConversationContent className="flex flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.length === 0 && (
            <Greeting chatId={chatId} sendMessage={sendMessage} />
          )}

          {messages.map((message, index) =>
            senderOf(message) === 'system' ? (
              <div key={message.id} className="flex justify-center">
                <span
                  data-testid="handoff-system-message"
                  className="rounded-full bg-secondary px-3 py-1 text-muted-foreground text-xs"
                >
                  {getTextFromMessage(message)}
                </span>
              </div>
            ) : (
            <PreviewMessage
              key={message.id}
              chatId={chatId}
              message={message}
              allMessages={messages}
              // The stream's `start` creates David's message while the chat is
              // still `submitted`: it counts as loading from then on (only
              // when David is the one answering).
              isLoading={
                messages.length - 1 === index &&
                (status === 'streaming' || awaiting === 'message')
              }
              setMessages={setMessages}
              addToolApprovalResponse={addToolApprovalResponse}
              sendMessage={sendMessage}
              regenerate={regenerate}
              isReadonly={isReadonly}
              requiresScrollPadding={
                hasSentMessage && index === messages.length - 1
              }
            />
            ),
          )}

          {/* The request failed before David started answering. */}
          {status === 'error' && messages.at(-1)?.role === 'user' && !isReadonly && (
            <div className="flex items-start gap-3">
              <BrandMark size={26} className="mt-0.5" />
              <AgentUnavailable />
            </div>
          )}

          {awaiting === 'list' && selectedModelId !== 'chat-model-reasoning' && (
            <AwaitingResponseMessage />
          )}

          <div
            ref={messagesEndRef}
            className="min-h-[24px] min-w-[24px] shrink-0"
          />
        </ConversationContent>
      </Conversation>

      {!isAtBottom && (
        <button
          className="-translate-x-1/2 absolute bottom-40 left-1/2 z-10 rounded-full border bg-background p-2 shadow-lg transition-colors hover:bg-muted"
          onClick={() => scrollToBottom('smooth')}
          type="button"
          aria-label="Scroll to bottom"
        >
          <ArrowDownIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.selectedModelId !== nextProps.selectedModelId) return false;
  if (prevProps.handledBy !== nextProps.handledBy) return false;
  if (prevProps.agentPending !== nextProps.agentPending) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;

  return false;
});
