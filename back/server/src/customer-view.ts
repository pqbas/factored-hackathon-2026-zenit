import type { Chat, DBMessage } from '@chat-template/db';

// Customer-facing routes never expose an employee's email: the customer only
// learns that an advisor answers (senderType 'human_agent'), not who.
export function toCustomerChat<T extends Pick<Chat, 'assignedTo'>>(chat: T): T {
  return { ...chat, assignedTo: null };
}

export function toCustomerMessage<T extends Pick<DBMessage, 'senderId'>>(
  message: T,
): T {
  return { ...message, senderId: null };
}
