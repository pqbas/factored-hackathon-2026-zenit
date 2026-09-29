import type { Chat, DBMessage } from '@chat-template/db';

// Customer-facing routes never expose an employee's email: the customer only
// learns that an advisor answers (senderType 'human_agent'), not who. The
// bank customer's name is for the console only.
export function toCustomerChat<
  T extends Pick<Chat, 'assignedTo'> & Partial<Pick<Chat, 'customerName'>>,
>(chat: T): Omit<T, 'customerName'> {
  const { customerName: _customerName, ...rest } = chat;
  return { ...rest, assignedTo: null };
}

export function toCustomerMessage<T extends Pick<DBMessage, 'senderId'>>(
  message: T,
): T {
  return { ...message, senderId: null };
}
