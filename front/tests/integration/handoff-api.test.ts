import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchHandledBy, fetchNewMessages } from '@/lib/handoff';

// The handoff fetchers with convertToUIMessages and a fake fetch that answers
// like the back.
const row = (id: string, senderType: string | null = null) => ({
  id,
  chatId: 'c1',
  role: senderType === 'human_agent' ? 'assistant' : 'user',
  parts: [{ type: 'text', text: id }],
  attachments: [],
  createdAt: '2026-09-28T10:00:00.000Z',
  senderType,
  // Customer routes never say which advisor answered.
  senderId: null,
});

function fakeFetch(answer: (url: string) => Response) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      return answer(url);
    }),
  );
  return urls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('handoff fetchers', () => {
  it('reads new messages after the last one and keeps senderType', async () => {
    const urls = fakeFetch(() => json([row('m3', 'human_agent')]));
    const result = await fetchNewMessages('c1', 'm2');
    expect(urls).toEqual(['/api/messages/c1?after=m2']);
    expect(result?.full).toBe(false);
    expect(result?.messages[0].metadata).toMatchObject({ senderType: 'human_agent' });
  });

  it('reloads the whole list when after is unknown (400)', async () => {
    const urls = fakeFetch((url) =>
      url.includes('after=') ? json({ code: 'bad_request:api' }, 400) : json([row('m1'), row('m2')]),
    );
    const result = await fetchNewMessages('c1', 'gone');
    expect(urls).toEqual(['/api/messages/c1?after=gone', '/api/messages/c1']);
    expect(result?.full).toBe(true);
    expect(result?.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('returns null without a database (204)', async () => {
    fakeFetch(() => new Response(null, { status: 204 }));
    expect(await fetchNewMessages('c1', 'm1')).toBeNull();
  });

  it('reads handledBy from the chat', async () => {
    fakeFetch(() => json({ id: 'c1', handledBy: 'human_agent' }));
    expect(await fetchHandledBy('c1')).toBe('human_agent');
  });
});
