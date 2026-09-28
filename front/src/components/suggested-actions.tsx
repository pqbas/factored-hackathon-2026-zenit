import { motion } from 'framer-motion';
import { memo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { VisibilityType } from './visibility-selector';
import type { ChatMessage } from '@chat-template/core';
import { CreditCard, Lock, TrendingUp, UserPlus, type LucideIcon } from 'lucide-react';
import { softNavigateToChatId } from '@/lib/navigation';
import { useAppConfig } from '@/contexts/AppConfigContext';
import { cn } from '@/lib/utils';

interface SuggestedActionsProps {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  selectedVisibilityType?: VisibilityType;
}

interface SuggestedAction {
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
  tint: string;
}

const SUGGESTED_ACTIONS: SuggestedAction[] = [
  {
    title: 'Consultar mi saldo',
    description: 'Cuentas y tarjetas',
    prompt: '¿Cuál es el saldo de mis cuentas?',
    icon: CreditCard,
    tint: 'bg-tint-green text-tint-green-foreground',
  },
  {
    title: 'Agregar beneficiario',
    description: 'Para transferir a alguien nuevo',
    prompt: 'Quiero agregar un beneficiario',
    icon: UserPlus,
    tint: 'bg-tint-blue text-tint-blue-foreground',
  },
  {
    title: 'Aumentar mi límite',
    description: 'Solicitud en un minuto',
    prompt: 'Quiero aumentar el límite de mi tarjeta de crédito',
    icon: TrendingUp,
    tint: 'bg-tint-amber text-tint-amber-foreground',
  },
  {
    title: 'Bloquear una tarjeta',
    description: 'Si la perdiste o te la robaron',
    prompt: 'Perdí mi tarjeta y quiero bloquearla',
    icon: Lock,
    tint: 'bg-tint-red text-tint-red-foreground',
  },
];

function PureSuggestedActions({ chatId, sendMessage }: SuggestedActionsProps) {
  const { chatHistoryEnabled } = useAppConfig();

  return (
    <div
      data-testid="suggested-actions"
      className="mx-auto grid w-full max-w-[600px] gap-3 sm:grid-cols-2"
    >
      {SUGGESTED_ACTIONS.map((action, index) => {
        const Icon = action.icon;
        return (
          <motion.button
            type="button"
            key={action.title}
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
                action.tint,
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
