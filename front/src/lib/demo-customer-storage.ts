// Which demo customer each chat talks as. The back never stores the token on
// purpose, so the browser remembers it: per chat, plus the last one picked for
// new chats. Storage can throw (blocked site data), so every access is guarded
// and the app just stops remembering.

const LAST_KEY = 'demo-customer:last';
const chatKey = (chatId: string) => `demo-customer:chat:${chatId}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the choice just isn't remembered.
  }
}

export function getChatCustomerToken(chatId: string): string | null {
  return read(chatKey(chatId));
}

export function setChatCustomerToken(chatId: string, token: string): void {
  write(chatKey(chatId), token);
}

export function getLastCustomerToken(): string | null {
  return read(LAST_KEY);
}

export function setLastCustomerToken(token: string): void {
  write(LAST_KEY, token);
}

// The last pick if it is still offered, else the first customer, else none.
export function pickDefaultToken(
  customers: { token: string }[],
  lastToken: string | null,
): string | null {
  if (lastToken && customers.some((c) => c.token === lastToken)) {
    return lastToken;
  }
  return customers[0]?.token ?? null;
}
