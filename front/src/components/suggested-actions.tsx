import { memo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { VisibilityType } from './visibility-selector';
import type { ChatMessage } from '@chat-template/core';
import { softNavigateToChatId } from '@/lib/navigation';
import { ACTION_STYLES, ActionCard } from '@/components/action-card';
import { useAppConfig } from '@/contexts/AppConfigContext';
import { useLang } from '@/contexts/LangContext';

interface SuggestedActionsProps {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  selectedVisibilityType?: VisibilityType;
}

function PureSuggestedActions({ chatId, sendMessage }: SuggestedActionsProps) {
  const { chatHistoryEnabled } = useAppConfig();
  const { t } = useLang();

  return (
    <div
      data-testid="suggested-actions"
      className="mx-auto grid w-full max-w-[600px] gap-3 sm:grid-cols-2"
    >
      {t.actions.map((action, index) => (
        <ActionCard
          key={index}
          {...ACTION_STYLES[index]}
          title={action.title}
          description={action.description}
          index={index}
          testId={`suggested-action-${index}`}
          onClick={() => {
            softNavigateToChatId(chatId, chatHistoryEnabled);
            sendMessage({
              role: 'user',
              parts: [{ type: 'text', text: action.prompt }],
            });
          }}
        />
      ))}
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) return false;
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType)
      return false;

    return true;
  },
);
