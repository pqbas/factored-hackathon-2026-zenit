import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMessages,
  releaseConversation,
  replyToConversation,
  takeConversation,
} from '@/lib/advisor';

// The API helpers together with a fake fetch that answers like the back.
type Call = { url: string; method: string; body: unknown };
function fakeFetch(answer: (call: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = {
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      };
      calls.push(call);
      return answer(call);
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('advisor API helpers', () => {
  it('take returns who holds the chat on 409 and never sends force', async () => {
    const calls = fakeFetch(() =>
      json({ code: 'conflict:chat', assignedTo: 'ada@example.com' }, 409),
    );
    expect(await takeConversation('c1')).toEqual({ ok: false, assignedTo: 'ada@example.com' });
    expect(calls[0]).toMatchObject({ url: '/api/advisor/conversations/c1/take', method: 'POST', body: {} });
  });

  it('reply and release use the contract routes and bodies', async () => {
    const calls = fakeFetch((call) =>
      call.url.endsWith('/messages')
        ? json({ message: { id: 'm1' } }, 201)
        : json({ chat: { id: 'c1', handledBy: 'ai_agent' } }),
    );
    expect(await replyToConversation('c1', 'Hola')).toMatchObject({ ok: true, message: { id: 'm1' } });
    expect(await releaseConversation('c1', 'resolved')).toMatchObject({ ok: true });
    expect(calls.map((c) => [c.url, c.body])).toEqual([
      ['/api/advisor/conversations/c1/messages', { text: 'Hola' }],
      ['/api/advisor/conversations/c1/release', { outcome: 'resolved' }],
    ]);
  });

  it('reply and release report a 409 as a conflict', async () => {
    fakeFetch(() => json({ code: 'conflict:chat' }, 409));
    expect(await replyToConversation('c1', 'Hola')).toEqual({ ok: false, conflict: true });
    expect(await releaseConversation('c1', 'returned_to_agent')).toEqual({ ok: false, conflict: true });
  });

  it('reloads every message when after is unknown (400)', async () => {
    const calls = fakeFetch((call) =>
      call.url.includes('after=') ? json({ code: 'bad_request' }, 400) : json([{ id: 'a' }, { id: 'b' }]),
    );
    const result = await fetchMessages('c1', 'gone');
    expect(result.full).toBe(true);
    expect(result.messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(calls.map((c) => c.url)).toEqual([
      '/api/advisor/conversations/c1/messages?after=gone',
      '/api/advisor/conversations/c1/messages',
    ]);
  });
});
