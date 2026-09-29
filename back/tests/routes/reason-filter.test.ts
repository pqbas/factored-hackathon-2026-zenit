import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import {
  openHandoff,
  releaseChat,
  saveChat,
  updateChatAgentState,
} from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';

type Seeded = {
  userId: string;
  customerId?: string;
  handledBy?: 'ai_agent' | 'human_queue' | 'human_agent';
  reason?: string;
  resolved?: boolean;
  customerName?: string;
};

// Every chat belongs to an app user unique to the test, so ?userId= keeps
// other workers' chats out of the lists and counts.
async function createChat({
  userId,
  customerId,
  handledBy,
  reason,
  resolved,
}: Seeded) {
  const id = generateUUID();
  await saveChat({
    id,
    userId,
    userEmail: `${userId}@example.com`,
    title: 'Reason filter test chat',
    visibility: 'private',
    customerId: customerId ?? null,
  });
  if (handledBy) await updateChatAgentState({ chatId: id, handledBy });
  if (reason) {
    await openHandoff({ chatId: id, reason, summary: null, facts: null });
  }
  // Closing a chat also closes its handoff, which keeps its reason.
  if (resolved) await releaseChat({ chatId: id, outcome: 'resolved' });
  // Distinct createdAt values, so "most recent" is unambiguous.
  await new Promise((r) => setTimeout(r, 5));
  return id;
}

const newCustomer = (tag: string) => `CLI-${tag}-${generateUUID()}`;

test.describe('Handoff reason filter and in-progress conversation (with database)', () => {
  skipInEphemeralMode(test);

  test('handoffReason without groupBy keeps only chats whose latest handoff has that reason', async ({
    babbageContext,
  }) => {
    const userId = `reason-${generateUUID()}`;
    const complaint = await createChat({
      userId,
      handledBy: 'human_queue',
      reason: 'complaint',
    });
    const backToDavid = await createChat({
      userId,
      handledBy: 'human_queue',
      reason: 'complaint',
      resolved: true,
    });
    await createChat({ userId, handledBy: 'human_queue', reason: 'retention' });
    await createChat({ userId, handledBy: 'human_queue' });

    const list = async (query: string) => {
      const response = await babbageContext.request.get(
        `/api/advisor/conversations?userId=${userId}${query}`,
      );
      expect(response.status()).toBe(200);
      return (await response.json()).chats.map((c: any) => c.id);
    };

    // The default inbox still applies: open chats a human handles.
    expect(await list('&handoffReason=complaint')).toEqual([complaint]);
    // A resolved chat keeps its reason in the closed view.
    expect(await list('&status=closed&handoffReason=complaint')).toEqual([
      backToDavid,
    ]);
    expect(
      await list('&handoffReason=complaint&assignedTo=nobody@x.com'),
    ).toEqual([]);
  });

  test('grouped: handoffReason is judged on the in-progress conversation, not an older resolved one', async ({
    babbageContext,
  }) => {
    const userId = `reason-${generateUUID()}`;
    const x = newCustomer('X');
    const y = newCustomer('Y');
    await createChat({
      userId,
      customerId: x,
      handledBy: 'human_queue',
      reason: 'complaint',
      resolved: true,
    });
    const x2 = await createChat({
      userId,
      customerId: x,
      handledBy: 'human_queue',
      reason: 'retention',
    });
    const y1 = await createChat({
      userId,
      customerId: y,
      handledBy: 'human_queue',
      reason: 'complaint',
    });

    const rows = async (reason: string) => {
      const response = await babbageContext.request.get(
        `/api/advisor/conversations?groupBy=customer&userId=${userId}&handoffReason=${reason}`,
      );
      expect(response.status()).toBe(200);
      return (await response.json()).chats.map((r: any) => [
        r.customerKey,
        r.id,
        r.conversationCount,
      ]);
    };

    expect(await rows('complaint')).toEqual([[y, y1, 1]]);
    expect(await rows('retention')).toEqual([[x, x2, 2]]);
  });

  test('grouped open views pick the in-progress conversation; Resueltas the latest closed one', async ({
    babbageContext,
  }) => {
    const userId = `reason-${generateUUID()}`;
    const a = newCustomer('A');
    const a1 = await createChat({
      userId,
      customerId: a,
      handledBy: 'human_queue',
    });
    const a2 = await createChat({
      userId,
      customerId: a,
      handledBy: 'human_queue',
      resolved: true,
    });
    const a3 = await createChat({
      userId,
      customerId: a,
      handledBy: 'human_queue',
      resolved: true,
    });

    const rows = async (query: string) => {
      const response = await babbageContext.request.get(
        `/api/advisor/conversations?groupBy=customer&userId=${userId}${query}`,
      );
      expect(response.status()).toBe(200);
      return (await response.json()).chats.map((r: any) => [
        r.id,
        r.conversationCount,
      ]);
    };

    // Bandeja, En espera and the explicit open view all show a1.
    expect(await rows('')).toEqual([[a1, 3]]);
    expect(await rows('&status=open')).toEqual([[a1, 3]]);
    expect(await rows('&status=open&handledBy=human_queue')).toEqual([[a1, 3]]);
    expect(await rows('&status=open&handledBy=ai_agent')).toEqual([]);
    expect(await rows('&status=closed')).toEqual([[a3, 3]]);
    expect(a2).not.toBe(a3);

    const counts = await (
      await babbageContext.request.get(
        `/api/advisor/conversations/counts?groupBy=customer&userId=${userId}`,
      )
    ).json();
    expect(counts).toMatchObject({ total: 1, unattended: 1, resolved: 1 });
  });

  test('counts: byHandoffReason and withAdvisor use the base of total, with and without groupBy', async ({
    babbageContext,
  }) => {
    const userId = `reason-${generateUUID()}`;
    await createChat({
      userId,
      customerId: newCustomer('A'),
      handledBy: 'human_queue',
      reason: 'complaint',
    });
    await createChat({
      userId,
      customerId: newCustomer('B'),
      handledBy: 'human_agent',
      reason: 'retention',
    });
    await createChat({
      userId,
      customerId: newCustomer('C'),
      handledBy: 'human_queue',
      reason: 'other_reason',
    });
    // Back with David: its handoff closed, so it is not a human case.
    await createChat({
      userId,
      customerId: newCustomer('D'),
      handledBy: 'ai_agent',
      reason: 'complaint',
    });
    // A resolved complaint followed by a retention in progress: one customer.
    const x = newCustomer('X');
    await createChat({
      userId,
      customerId: x,
      handledBy: 'human_agent',
      reason: 'complaint',
      resolved: true,
    });
    await createChat({
      userId,
      customerId: x,
      handledBy: 'human_agent',
      reason: 'retention',
    });

    const counts = async (query: string) =>
      (
        await babbageContext.request.get(
          `/api/advisor/conversations/counts?userId=${userId}${query}`,
        )
      ).json();

    const flat = await counts('');
    expect(flat.byHandoffReason).toEqual({
      complaint: 1,
      retention: 2,
      case_status: 0,
      other_reason: 1,
    });
    expect(flat.withAdvisor).toBe(2);
    expect(flat.total).toBe(4);

    const grouped = await counts('&groupBy=customer');
    expect(grouped.byHandoffReason).toEqual({
      complaint: 1,
      retention: 2,
      case_status: 0,
      other_reason: 1,
    });
    expect(grouped.withAdvisor).toBe(2);
    expect(grouped.total).toBe(4);

    const empty = await (
      await babbageContext.request.get(
        `/api/advisor/conversations/counts?userId=none-${generateUUID()}`,
      )
    ).json();
    expect(empty.byHandoffReason).toEqual({
      complaint: 0,
      retention: 0,
      case_status: 0,
    });
    expect(empty.withAdvisor).toBe(0);
  });

  test('GET /api/chat/:id returns demoCustomerToken, never the customer id', async ({
    adaContext,
  }) => {
    const userId = `${adaContext.name}-id`;
    const eduardo = await createChat({
      userId,
      customerId: 'CLI-0IY07CEBUL79',
    });
    const stranger = await createChat({ userId, customerId: newCustomer('Z') });
    const anonymous = await createChat({ userId });

    const get = async (id: string) =>
      (await adaContext.request.get(`/api/chat/${id}`)).json();

    const own = await get(eduardo);
    expect(own.demoCustomerToken).toBe('demo-mx-2');
    expect(own).not.toHaveProperty('customerId');
    expect(own).not.toHaveProperty('customerName');
    expect((await get(stranger)).demoCustomerToken).toBeNull();
    expect((await get(anonymous)).demoCustomerToken).toBeNull();
  });
});
