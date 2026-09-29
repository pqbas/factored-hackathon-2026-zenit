import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import { saveChat, updateChatAgentState } from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';

// Every chat belongs to an app user unique to the test, so ?userId= keeps
// other workers' chats out of the lists and counts.
async function createChat({
  userId,
  customerId,
  userEmail,
  handledBy,
}: {
  userId: string;
  customerId?: string;
  userEmail?: string;
  handledBy?: 'ai_agent' | 'human_queue';
}) {
  const id = generateUUID();
  await saveChat({
    id,
    userId,
    userEmail: userEmail ?? `${userId}@example.com`,
    title: 'Customers test chat',
    visibility: 'private',
    customerId: customerId ?? null,
  });
  if (handledBy) await updateChatAgentState({ chatId: id, handledBy });
  // Distinct createdAt values, so "most recent" is unambiguous.
  await new Promise((r) => setTimeout(r, 5));
  return id;
}

// A: two queued chats. B (no bank customer, keyed by email): one queued chat,
// the newest. C: one chat with David.
async function seed() {
  const userId = `customers-${generateUUID()}`;
  const a = `CLI-A-${generateUUID()}`;
  const c = `CLI-C-${generateUUID()}`;
  const bEmail = `b-${generateUUID()}@example.com`;
  const a1 = await createChat({ userId, customerId: a, handledBy: 'human_queue' });
  const a2 = await createChat({ userId, customerId: a, handledBy: 'human_queue' });
  const c1 = await createChat({ userId, customerId: c });
  const b1 = await createChat({
    userId,
    userEmail: bEmail,
    handledBy: 'human_queue',
  });
  return { userId, a, c, bEmail, a1, a2, c1, b1 };
}

test.describe('Console grouped by customer (with database)', () => {
  skipInEphemeralMode(test);

  test('one row per customer, by its most recent chat, paginated by customerKey', async ({
    babbageContext,
  }) => {
    const { userId, a, bEmail, a2, b1, c, c1 } = await seed();
    const list = async (query: string) => {
      const response = await babbageContext.request.get(
        `/api/advisor/conversations?groupBy=customer&userId=${userId}${query}`,
      );
      expect(response.status()).toBe(200);
      return response.json();
    };

    const inbox = await list('&status=open');
    expect(
      inbox.chats.map((r: any) => [r.customerKey, r.id, r.conversationCount]),
    ).toEqual([
      [bEmail, b1, 1],
      [a, a2, 2],
    ]);
    expect(typeof inbox.chats[0].updatedAt).toBe('string');
    expect(inbox.chats[0]).toHaveProperty('lastMessage');
    expect(inbox.hasMore).toBe(false);

    const first = await list('&status=open&limit=1');
    expect(first.chats.map((r: any) => r.customerKey)).toEqual([bEmail]);
    expect(first.hasMore).toBe(true);
    const second = await list(
      `&status=open&limit=1&starting_after=${encodeURIComponent(bEmail)}`,
    );
    expect(second.chats.map((r: any) => r.customerKey)).toEqual([a]);
    expect(second.hasMore).toBe(false);

    const david = await list('&status=open&handledBy=ai_agent');
    expect(david.chats.map((r: any) => [r.customerKey, r.id])).toEqual([
      [c, c1],
    ]);
  });

  test('counts?groupBy=customer counts customers, not conversations', async ({
    babbageContext,
  }) => {
    const { userId } = await seed();
    const counts = async (query: string) =>
      (
        await babbageContext.request.get(
          `/api/advisor/conversations/counts?userId=${userId}${query}`,
        )
      ).json();

    expect(await counts('&groupBy=customer')).toMatchObject({
      total: 2,
      unattended: 2,
      aiAgent: 1,
      resolved: 0,
    });
    expect(await counts('')).toMatchObject({
      total: 3,
      unattended: 3,
      aiAgent: 1,
    });
  });

  test("a customer's conversations come oldest first; 404 unknown, 403 customer", async ({
    babbageContext,
    curieContext,
  }) => {
    const { a, a1, a2, bEmail, b1 } = await seed();

    const response = await babbageContext.request.get(
      `/api/advisor/customers/${encodeURIComponent(a)}/conversations`,
    );
    expect(response.status()).toBe(200);
    expect((await response.json()).chats.map((c: any) => c.id)).toEqual([
      a1,
      a2,
    ]);

    const byEmail = await babbageContext.request.get(
      `/api/advisor/customers/${encodeURIComponent(bEmail)}/conversations`,
    );
    expect((await byEmail.json()).chats.map((c: any) => c.id)).toEqual([b1]);

    expect(
      (
        await babbageContext.request.get(
          `/api/advisor/customers/CLI-NOPE-${generateUUID()}/conversations`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await curieContext.request.get(
          `/api/advisor/customers/${encodeURIComponent(a)}/conversations`,
        )
      ).status(),
    ).toBe(403);
  });
});
