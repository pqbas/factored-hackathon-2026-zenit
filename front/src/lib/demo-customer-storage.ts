// Persists which demo customer a chat talks to, so the token survives reloads
// and stays consistent across messages in the same thread. All localStorage
// access is wrapped in try/catch: some browsers block storage entirely, and
// losing the saved choice must never break the chat.

export interface DemoCustomer {
  token: string;
  label: string;
}

const LAST_CUSTOMER_KEY = 'demo-customer:last';
const chatCustomerKey = (chatId: string) => `demo-customer:chat:${chatId}`;

export function getChatCustomerToken(chatId: string): string | null {
  try {
    return localStorage.getItem(chatCustomerKey(chatId));
  } catch {
    return null;
  }
}

export function setChatCustomerToken(chatId: string, token: string): void {
  try {
    localStorage.setItem(chatCustomerKey(chatId), token);
  } catch {
    // Storage unavailable: the chat keeps working, it just won't remember.
  }
}

export function getLastCustomerToken(): string | null {
  try {
    return localStorage.getItem(LAST_CUSTOMER_KEY);
  } catch {
    return null;
  }
}

export function setLastCustomerToken(token: string): void {
  try {
    localStorage.setItem(LAST_CUSTOMER_KEY, token);
  } catch {
    // Storage unavailable: the chat keeps working, it just won't remember.
  }
}

/**
 * Picks the customer token a new chat should default to: the last one the
 * user chose if it's still in the list, otherwise the first one, or `null`
 * if there's nothing to pick from.
 */
export function pickDefaultToken(
  customers: DemoCustomer[],
  lastToken: string | null,
): string | null {
  if (customers.length === 0) {
    return null;
  }

  if (lastToken && customers.some((customer) => customer.token === lastToken)) {
    return lastToken;
  }

  return customers[0].token;
}
