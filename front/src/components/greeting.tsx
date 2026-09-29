import type { UseChatHelpers } from '@ai-sdk/react';
import { ASSISTANT_KIND, ASSISTANT_NAME } from '@/lib/assistant';
import type { ChatMessage } from '@chat-template/core';
import { motion } from 'framer-motion';

import { SuggestedActions } from '@/components/suggested-actions';
import { useSession } from '@/contexts/SessionContext';
import { useActiveCustomerToken } from '@/hooks/use-active-customer';
import { useDemoCustomers } from '@/hooks/use-demo-customers';
import { customerFirstName } from '@/lib/demo-customer-storage';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function firstName(value: string | undefined): string | null {
  if (!value) return null;
  const base = value.includes('@') ? value.split('@')[0] : value;
  const name = base.split(/[\s._-]+/)[0];
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}

export const Greeting = ({
  chatId,
  sendMessage,
}: {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
}) => {
  const { session } = useSession();
  const { customers } = useDemoCustomers();
  const token = useActiveCustomerToken();
  // Greet the bank customer the chat talks as; without demo customers, the
  // app user as before.
  const customer = customers.find((c) => c.token === token);
  const name = customers.length
    ? customerFirstName(customer?.label)
    : firstName(
        session?.user?.name ||
          session?.user?.preferredUsername ||
          session?.user?.email,
      );
  const greeting = greetingForHour(new Date().getHours());

  return (
    <div
      key="overview"
      className="mx-auto flex min-h-[calc(100dvh-13rem)] w-full max-w-3xl flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ delay: 0.3 }}
        data-testid="greeting"
        className="font-semibold text-3xl tracking-tight md:text-[42px]"
      >
        {name ? `${greeting}, ${name}` : greeting}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ delay: 0.4 }}
        className="text-base text-muted-foreground md:text-[17px]"
      >
        Soy {ASSISTANT_NAME}, tu {ASSISTANT_KIND.toLowerCase()}. ¿En qué te puedo
        ayudar hoy?
      </motion.p>
      <div className="mt-8 w-full">
        <SuggestedActions chatId={chatId} sendMessage={sendMessage} />
      </div>
    </div>
  );
};
