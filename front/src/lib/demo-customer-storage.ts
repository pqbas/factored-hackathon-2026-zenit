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

// The session pick: the customer chosen in a selector. It is what new chats,
// the sidebar and the greeting follow. Opening a chat is not a pick.
export function chooseCustomerToken(token: string): void {
  setLastCustomerToken(token);
  setActiveCustomerToken(token);
}

// An existing chat's customer: the back's record, else what this browser
// remembered for the chat, else none.
export function chatCustomerToken(chatId: string, fromBack: string | null | undefined): string | null {
  return fromBack ?? getChatCustomerToken(chatId);
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

// The demo customer the app is showing right now: the open chat's, the one
// picked for a new chat, or the one in Mis productos. The history sidebar and
// the greeting follow it. Starts from the last pick.
let active: string | null | undefined;
const listeners = new Set<() => void>();

export function getActiveCustomerToken(): string | null {
  if (active === undefined) active = getLastCustomerToken();
  return active;
}

export function setActiveCustomerToken(token: string | null): void {
  if (token === getActiveCustomerToken()) return;
  active = token;
  for (const listener of listeners) listener();
}

export function subscribeActiveCustomer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// "Santiago · México" → "Santiago": the label starts with the first name.
export function customerFirstName(label: string | null | undefined): string | null {
  if (!label?.includes(' · ')) return null;
  return label.split(' · ')[0].trim().split(/\s+/)[0] || null;
}
