import { motion } from 'framer-motion';
import { memo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { VisibilityType } from './visibility-selector';
import type { ChatMessage } from '@chat-template/core';
import { CircleAlert, CreditCard, Ellipsis, PiggyBank, type LucideIcon } from 'lucide-react';
import { softNavigateToChatId } from '@/lib/navigation';
import { useAppConfig } from '@/contexts/AppConfigContext';
import { useLang } from '@/contexts/LangContext';
import { cn } from '@/lib/utils';

interface SuggestedActionsProps {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  selectedVisibilityType?: VisibilityType;
}

// The options of David's menu (docs/flujo-atencion.md, etapa 2): only what he
// actually does. Texts come from the chosen language (MESSAGES.actions), in
// this same order.
const ACTION_STYLES: { icon: LucideIcon; tint: string }[] = [
  { icon: CreditCard, tint: 'bg-tint-green text-tint-green-foreground' },
  { icon: PiggyBank, tint: 'bg-tint-blue text-tint-blue-foreground' },
  { icon: CircleAlert, tint: 'bg-tint-red text-tint-red-foreground' },
  { icon: Ellipsis, tint: 'bg-tint-amber text-tint-amber-foreground' },
];

function PureSuggestedActions({ chatId, sendMessage }: SuggestedActionsProps) {
  const { chatHistoryEnabled } = useAppConfig();
  const { t } = useLang();

  return (
    <div
      data-testid="suggested-actions"
      className="mx-auto grid w-full max-w-[600px] gap-3 sm:grid-cols-2"
    >
      {t.actions.map((action, index) => {
        const { icon: Icon, tint } = ACTION_STYLES[index];
        return (
          <motion.button
            type="button"
            key={index}
            data-testid={`suggested-action-${index}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ delay: 0.05 * index }}
            onClick={() => {
              softNavigateToChatId(chatId, chatHistoryEnabled);
              sendMessage({
                role: 'user',
                parts: [{ type: 'text', text: action.prompt }],
              });
            }}
            className="flex items-center gap-3 rounded-[14px] bg-card px-4 py-3.5 text-left transition-colors hover:bg-secondary"
          >
            <span
              className={cn(
                'flex size-[34px] shrink-0 items-center justify-center rounded-[9px]',
                tint,
              )}
            >
              <Icon className="size-[18px]" strokeWidth={1.8} />
            </span>
            <span className="flex flex-col">
              <span className="font-medium text-sm">{action.title}</span>
              <span className="text-muted-foreground text-xs">
                {action.description}
              </span>
            </span>
          </motion.button>
        );
      })}
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
