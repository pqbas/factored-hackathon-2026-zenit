import type { Chat, DBMessage } from '@chat-template/db';

// Customer-facing routes never expose an employee's email: the customer only
// learns that an advisor answers (senderType 'human_agent'), not who. The
// bank customer's id and name are for the console only.
export function toCustomerChat<
  T extends Pick<Chat, 'assignedTo'> &
    Partial<Pick<Chat, 'customerId' | 'customerName'>>,
>(chat: T): Omit<T, 'customerId' | 'customerName'> {
  const {
    customerId: _customerId,
    customerName: _customerName,
    ...rest
  } = chat;
  return { ...rest, assignedTo: null };
}

export function toCustomerMessage<T extends Pick<DBMessage, 'senderId'>>(
  message: T,
): T {
  return { ...message, senderId: null };
}
