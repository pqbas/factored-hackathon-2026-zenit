import { ASSISTANT_TITLE } from '@/lib/assistant';
import React, { memo, useState } from 'react';
import { UserRound } from 'lucide-react';
import { BrandMark } from './brand-mark';
import { senderOf } from '@/lib/handoff';
import { useLang } from '@/contexts/LangContext';
import { Response } from './elements/response';
import { MessageContent } from './elements/message';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolState,
} from './elements/tool';
import {
  McpTool,
  McpToolHeader,
  McpToolContent,
  McpToolInput,
  McpApprovalActions,
} from './elements/mcp-tool';
import { MessageActions } from './message-actions';
import { TypingIndicator } from './typing-indicator';
import { PreviewAttachment } from './preview-attachment';
import equal from 'fast-deep-equal';
import { cn, sanitizeText } from '@/lib/utils';
import { MessageEditor } from './message-editor';
import { MessageReasoning } from './message-reasoning';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@chat-template/core';
import { useDataStream } from './data-stream-provider';
import {
  createMessagePartSegments,
  formatNamePart,
  isNamePart,
  joinMessagePartSegments,
} from './databricks-message-part-transformers';
import { AgentUnavailable } from './agent-unavailable';
import { MessageOAuthError } from './message-oauth-error';
import { isCredentialErrorMessage } from '@/lib/oauth-error-utils';
import { Streamdown } from 'streamdown';
import { useApproval } from '@/hooks/use-approval';

const PurePreviewMessage = ({
  message,
  allMessages,
  isLoading,
  setMessages,
  addToolApprovalResponse,
  sendMessage,
  regenerate,
  isReadonly,
  requiresScrollPadding,
}: {
  chatId: string;
  message: ChatMessage;
  allMessages: ChatMessage[];
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>['addToolApprovalResponse'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [showErrors, setShowErrors] = useState(false);
  // Advisor replies are role 'assistant' too; senderType tells them apart.
  const isAdvisor = senderOf(message) === 'advisor';
  const { t } = useLang();
  // David is streaming but no text arrived yet (e.g. a slow data query).
  const awaitingText =
    isLoading &&
    message.role === 'assistant' &&
    !isAdvisor &&
    !message.parts.some((part) => part.type === 'text' && part.text.length > 0);

  // Hook for handling MCP approval requests
  const { submitApproval, isSubmitting, pendingApprovalId } = useApproval({
    addToolApprovalResponse,
    sendMessage,
  });

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === 'file',
  );

  // Extract non-OAuth error parts separately (OAuth errors are rendered inline)
  const errorParts = React.useMemo(
    () =>
      message.parts
        .filter((part) => part.type === 'data-error')
        .filter((part) => {
          // OAuth errors are rendered inline, not in the error section
          return !isCredentialErrorMessage(part.data);
        }),
    [message.parts],
  );

  useDataStream();

  const partSegments = React.useMemo(
    /**
     * We segment message parts into segments that can be rendered as a single component.
     * Used to render citations as part of the associated text.
     * Note: OAuth errors are included here for inline rendering, non-OAuth errors are filtered out.
     */
    () =>
      createMessagePartSegments(
        message.parts.filter(
          (part) =>
            part.type !== 'data-error' || isCredentialErrorMessage(part.data),
        ),
      ),
    [message.parts],
  );

  // Check if message only contains non-OAuth errors (no other content)
  const hasOnlyErrors = React.useMemo(() => {
    const nonErrorParts = message.parts.filter(
      (part) => part.type !== 'data-error',
    );
    // Only consider non-OAuth errors for this check
    return errorParts.length > 0 && nonErrorParts.length === 0;
  }, [message.parts, errorParts.length]);

  return (
    <div
      data-testid={`message-${message.role}`}
      className="group/message w-full"
      data-role={message.role}
    >
      <div
        className={cn('flex w-full items-start gap-2 md:gap-3', {
          'justify-end': message.role === 'user',
          'justify-start': message.role === 'assistant',
        })}
      >
        {message.role === 'assistant' &&
          (isAdvisor ? (
            <span className="mt-0.5 flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <UserRound className="size-4" strokeWidth={2} />
            </span>
          ) : (
            <span title={ASSISTANT_TITLE} aria-label={ASSISTANT_TITLE} className="shrink-0">
              <BrandMark size={26} pulse={isLoading} className="mt-0.5" />
            </span>
          ))}

        <div
          className={cn('flex min-w-0 flex-col gap-3', {
            'w-full': message.role === 'assistant' || mode === 'edit',
            'min-h-96': message.role === 'assistant' && requiresScrollPadding,
            'max-w-[70%] sm:max-w-[min(fit-content,80%)]':
              message.role === 'user' && mode !== 'edit',
          })}
        >
          {isAdvisor && (
            <span
              data-testid="advisor-label"
              className="-mb-2 font-semibold text-muted-foreground text-xs"
            >
              {t.advisor}
            </span>
          )}
          {awaitingText && <TypingIndicator className="text-muted-foreground" />}
          {attachmentsFromMessage.length > 0 && (
            <div
              data-testid={`message-attachments`}
              className="flex flex-row justify-end gap-2"
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  key={attachment.url}
                  attachment={{
                    name: attachment.filename ?? 'file',
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                />
              ))}
            </div>
          )}

          {partSegments?.map((parts, index) => {
            const [part] = parts;
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type === 'reasoning' && part.text?.trim().length > 0) {
              return (
                <MessageReasoning
                  key={key}
                  isLoading={isLoading}
                  reasoning={part.text}
                />
              );
            }

            if (type === 'text') {
              if (isNamePart(part)) {
                return (
                  <Streamdown
                    key={key}
                    className="-mb-2 mt-0 border-l-4 pl-2 text-muted-foreground"
                  >{`# ${formatNamePart(part)}`}</Streamdown>
                );
              }
              if (mode === 'view') {
                return (
                  <div key={key}>
                    <MessageContent
                      data-testid="message-content"
                      className={cn({
                        'w-fit break-words rounded-[18px] bg-primary px-3.5 py-2 text-left text-primary-foreground':
                          message.role === 'user',
                        'bg-transparent px-0 py-0 text-left':
                          message.role === 'assistant',
                      })}
                    >
                      {/* Advisor replies are a person's text: shown
                          literally, never as markdown (no images/links). */}
                      {isAdvisor ? (
                        <p className="whitespace-pre-wrap break-words">
                          {joinMessagePartSegments(parts)}
                        </p>
                      ) : (
                        <Response>
                          {sanitizeText(joinMessagePartSegments(parts))}
                        </Response>
                      )}
                    </MessageContent>
                  </div>
                );
              }

              if (mode === 'edit') {
                return (
                  <div
                    key={key}
                    className="flex w-full flex-row items-start gap-3"
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        setMode={setMode}
                        setMessages={setMessages}
                        regenerate={regenerate}
                      />
                    </div>
                  </div>
                );
              }
            }

            // Render Databricks tool calls and results
            if (part.type === `dynamic-tool`) {
              const { toolCallId, input, state, errorText, output, toolName } = part;

              // Check if this is an MCP tool call by looking for approvalRequestId in metadata
              // This works across all states (approval-requested, approval-denied, output-available)
              const isMcpApproval = part.callProviderMetadata?.databricks?.approvalRequestId != null;
              const mcpServerName = part.callProviderMetadata?.databricks?.mcpServerName?.toString();

              // Extract approval outcome for 'approval-responded' state
              // When addToolApprovalResponse is called, AI SDK sets the `approval` property
              // on the tool-call part and changes state to 'approval-responded'
              const approved: boolean | undefined =
                'approval' in part ? part.approval?.approved : undefined;


              // When approved but only have approval status (not actual output), show as input-available
              const effectiveState: ToolState = (() => {
                  if (part.providerExecuted && !isLoading && state === 'input-available') {
                    return 'output-available'
                  }
                return state;
              })()

              // Render MCP tool calls with special styling
              if (isMcpApproval) {
                return (
                  <McpTool key={toolCallId} defaultOpen={true}>
                    <McpToolHeader
                      serverName={mcpServerName}
                      toolName={toolName}
                      state={effectiveState}
                      approved={approved}
                    />
                    <McpToolContent>
                      <McpToolInput input={input} />
                      {state === 'approval-requested' && (
                        <McpApprovalActions
                          onApprove={() =>
                            submitApproval({
                              approvalRequestId: toolCallId,
                              approve: true,
                            })
                          }
                          onDeny={() =>
                            submitApproval({
                              approvalRequestId: toolCallId,
                              approve: false,
                            })
                          }
                          isSubmitting={
                            isSubmitting && pendingApprovalId === toolCallId
                          }
                        />
                      )}
                      {state === 'output-available' && output != null && (
                        <ToolOutput
                          output={
                            errorText ? (
                              <div className="rounded border p-2 text-red-500">
                                Error: {errorText}
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap font-mono text-sm">
                                {typeof output === 'string'
                                  ? output
                                  : JSON.stringify(output, null, 2)}
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </McpToolContent>
                  </McpTool>
                );
              }

              // Render regular tool calls
              return (
                <Tool key={toolCallId} defaultOpen={true}>
                  <ToolHeader
                    type={toolName}
                    state={effectiveState}
                  />
                  <ToolContent>
                    <ToolInput input={input} />
                    {state === 'output-available' && (
                      <ToolOutput
                        output={
                          errorText ? (
                            <div className="rounded border p-2 text-red-500">
                              Error: {errorText}
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap font-mono text-sm">
                              {typeof output === 'string'
                                ? output
                                : JSON.stringify(output, null, 2)}
                            </div>
                          )
                        }
                        errorText={undefined}
                      />
                    )}
                  </ToolContent>
                </Tool>
              );
            }

            // Support for citations/annotations
            if (type === 'source-url') {
              return (
                <a
                  key={key}
                  href={part.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-baseline text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <sup className="text-xs">[{part.title || part.url}]</sup>
                </a>
              );
            }

            // Render OAuth errors inline
            if (type === 'data-error' && isCredentialErrorMessage(part.data)) {
              return (
                <MessageOAuthError
                  key={key}
                  error={part.data}
                  allMessages={allMessages}
                  setMessages={setMessages}
                  sendMessage={sendMessage}
                />
              );
            }
          })}

          {!isReadonly && !hasOnlyErrors && (
            <MessageActions
              key={`action-${message.id}`}
              message={message}
              isLoading={isLoading}
              setMode={setMode}
              errorCount={0}
              showErrors={showErrors}
              onToggleErrors={() => setShowErrors(!showErrors)}
            />
          )}

          {/* David couldn't answer: a friendly note, never the technical error. */}
          {errorParts.length > 0 && !isLoading && <AgentUnavailable />}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding)
      return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;

    return false;
  },
);

export const AwaitingResponseMessage = () => {
  const role = 'assistant';

  return (
    <div
      data-testid="message-assistant-loading"
      className="group/message w-full"
      data-role={role}
    >
      <div className="flex items-start justify-start gap-3">
        <BrandMark size={26} pulse className="mt-0.5" />

        <div className="flex w-full flex-col gap-2 md:gap-4">
          <TypingIndicator className="text-muted-foreground" />
        </div>
      </div>
    </div>
  );
};
