import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import { ChatPage } from '../pages/chat';
import { mockSessionRole, type Role } from '../session-role';

const ME = 'babbage@example.com';
const OTHER = 'ada@example.com';

type Chat = {
  id: string;
  title: string;
  createdAt: string;
  userId: string;
  userEmail: string | null;
  handledBy: 'ai_agent' | 'human_queue' | 'human_agent';
  assignedTo: string | null;
  assignedAt: string | null;
  closedAt: string | null;
  useCase: string | null;
  customerName?: string | null;
  customerKey?: string;
  hasHandoff?: boolean;
  handoff?: Record<string, unknown> | null;
  lastMessage?: { text: string; senderType: string; createdAt: string } | null;
};
type Message = {
  id: string;
  chatId: string;
  role: string;
  parts: { type: string; text: string }[];
  createdAt: string;
  senderType: 'customer' | 'ai_agent' | 'human_agent' | 'system' | null;
  senderId: string | null;
};

// An in-memory advisor API that follows the back's contract
// (back/spec/28-09-26-consola-asesor/requirements.md §1), served in the
// browser with page.route.
async function mockAdvisorApi(page: Page, me: string, role: Role = 'advisor') {
  let seq = 0;
  const now = () => new Date(Date.UTC(2026, 8, 28, 10, 0, seq++)).toISOString();
  const chat = (id: string, email: string, extra: Partial<Chat>): Chat => ({
    id,
    title: `Consulta de ${email.split('@')[0]}`,
    createdAt: now(),
    userId: `${id}-user`,
    userEmail: email,
    handledBy: 'ai_agent',
    assignedTo: null,
    assignedAt: null,
    closedAt: null,
    useCase: 'GENERAL_INQUIRY',
    ...extra,
  });
  const chats: Chat[] = [
    // Daniela wrote before: an earlier, resolved conversation.
    chat('c-old', 'daniela@banco.test', {
      customerName: 'Daniela Sosa Ruiz',
      useCase: 'CASE_STATUS',
      // A retention handoff that was already resolved: it must not count once
      // she has a newer ongoing conversation.
      hasHandoff: false,
      handoff: {
        reason: 'retention',
        summary: 'La clienta pidió cancelar una tarjeta.',
        verifiedData: null,
        facts: null,
        at: '2026-09-20T10:00:00.000Z',
        resolvedAt: '2026-09-21T10:00:00.000Z',
      },
      closedAt: now(),
    }),
    chat('c-assistant', 'javier@banco.test', {}),
    chat('c-waiting', 'daniela@banco.test', {
      customerName: 'Daniela Sosa Ruiz',
      // David handed off a verified complaint.
      hasHandoff: true,
      handoff: {
        reason: 'complaint',
        summary: 'La clienta reclama un cobro duplicado de 84,20 USD en SUPERMERCADO LÍDER.',
        verifiedData: {
          card_last4: '1070',
          transaction_date: '2026-09-24',
          merchant: 'SUPERMERCADO LÍDER',
          amount: 84.2,
          currency: 'USD',
          transaction_status: 'Approved',
          complaint_type: 'duplicate_charge',
          description: 'Me cobraron dos veces',
        },
        facts: null,
        at: '2026-09-28T10:00:00.000Z',
        resolvedAt: null,
      },
      handledBy: 'human_queue',
      lastMessage: { text: 'Es urgente, por favor', senderType: 'customer', createdAt: now() },
    }),
    chat('c-race', 'santiago@banco.test', { handledBy: 'human_queue', useCase: null }),
    chat('c-other', 'lucia@banco.test', {
      handledBy: 'human_agent',
      assignedTo: OTHER,
      assignedAt: now(),
    }),
    chat('c-closed', 'marta@banco.test', { closedAt: now() }),
  ];
  const messages: Message[] = [];
  const say = (chatId: string, senderType: Message['senderType'], text: string, senderId: string | null = null) => {
    const message: Message = {
      id: `m${seq}`,
      chatId,
      role: senderType === 'customer' ? 'user' : senderType === 'system' ? 'system' : 'assistant',
      parts: [{ type: 'text', text }],
      createdAt: now(),
      senderType,
      senderId,
    };
    messages.push(message);
    return message;
  };
  for (const c of chats) say(c.id, 'customer', `Hola, soy ${c.userEmail}`);
  say('c-old', 'ai_agent', 'Tu caso 48213 sigue en revisión.');
  say('c-waiting', 'system', 'Te atiende un asesor.');
  say('c-waiting', 'customer', 'Mira ![](https://tracker.test/px.png) y [aquí](https://phishing.test/login)');
  say('c-assistant', 'ai_agent', 'Tus tarjetas activas:\n\n- Terminada en **1070**\n- Terminada en 6262');

  const requested: string[] = [];
  await page.route('**/api/advisor/users', (route) =>
    role === 'admin'
      ? route.fulfill({
          json: { users: chats.map((c) => ({ userId: c.userId, userEmail: c.userEmail })) },
        })
      : route.fulfill({ status: 403, json: { code: 'forbidden:chat' } }),
  );
  // All of a customer's conversations, oldest first.
  await page.route('**/api/advisor/customers/*/conversations', (route) => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[4]);
    const list = chats.filter((c) => (c.userEmail ?? c.userId) === key);
    return list.length
      ? route.fulfill({ json: { chats: list } })
      : route.fulfill({ status: 404, json: { code: 'not_found:chat' } });
  });
  await page.route('**/api/advisor/conversations**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requested.push(url.pathname + url.search);
    const [, , , , id, action] = url.pathname.split('/');
    const target = chats.find((c) => c.id === id);
    const body = request.postDataJSON() ?? {};

    // One row per customer (keyed by email here). Open views take their
    // ongoing conversation (the latest with closedAt null); Resueltas their
    // latest closed one.
    const keyOf = (c: Chat) => c.userEmail ?? c.userId;
    const rowOf = (c: Chat) => ({
      ...c,
      customerKey: keyOf(c),
      conversationCount: chats.filter((x) => keyOf(x) === keyOf(c)).length,
    });
    const lastOf = (closed: boolean) => {
      const byCustomer = new Map<string, Chat>();
      for (const c of chats) if (!!c.closedAt === closed) byCustomer.set(keyOf(c), c);
      return [...byCustomer.values()].map(rowOf);
    };
    const ongoing = lastOf(false);
    const lastClosed = lastOf(true);

    if (id === 'counts') {
      // The inbox counts only the cases that need a person.
      const human = ongoing.filter((c) => c.handledBy !== 'ai_agent');
      const byHandoffReason: Record<string, number> = { complaint: 0, retention: 0, case_status: 0 };
      for (const c of human) {
        const reason = c.handoff?.reason as string | undefined;
        if (reason) byHandoffReason[reason] = (byHandoffReason[reason] ?? 0) + 1;
      }
      return route.fulfill({
        json: {
          total: human.length,
          aiAgent: ongoing.length - human.length,
          byHandoffReason,
          unattended: ongoing.filter((c) => c.handledBy === 'human_queue').length,
          withAdvisor: ongoing.filter((c) => c.handledBy === 'human_agent').length,
          resolved: lastClosed.length,
        },
      });
    }
    if (!id) {
      const q = url.searchParams;
      expect(q.get('groupBy')).toBe('customer');
      const list = (q.get('status') === 'closed' ? lastClosed : ongoing).filter(
        (c) =>
          (!q.get('userId') || c.userId === q.get('userId')) &&
          (!q.get('handoffReason') || c.handoff?.reason === q.get('handoffReason')) &&
          (q.get('handledBy')
            ? c.handledBy === q.get('handledBy')
            : q.get('status') === 'closed' || c.handledBy !== 'ai_agent'),
      );
      return route.fulfill({ json: { chats: list, hasMore: false } });
    }
    if (!target) return route.fulfill({ status: 404, json: { code: 'not_found:chat' } });
    // No bank customer unless a test says otherwise.
    if (action === 'customer-context') return route.fulfill({ status: 204 });
    if (action === 'messages' && request.method() === 'GET') {
      const all = messages.filter((m) => m.chatId === id);
      const after = url.searchParams.get('after');
      const index = after ? all.findIndex((m) => m.id === after) : -1;
      if (after && index < 0) return route.fulfill({ status: 400, json: {} });
      return route.fulfill({ json: all.slice(index + 1) });
    }
    if (action === 'take') {
      const heldByOther = target.assignedTo && target.assignedTo !== me;
      if (id === 'c-race' || heldByOther) {
        return route.fulfill({
          status: 409,
          json: { code: 'conflict:chat', assignedTo: id === 'c-race' ? OTHER : target.assignedTo },
        });
      }
      Object.assign(target, { handledBy: 'human_agent', assignedTo: me, assignedAt: now(), closedAt: null });
      say(id, 'system', 'Te atiende un asesor.');
      return route.fulfill({ json: { chat: target } });
    }
    if (action === 'messages') {
      if (target.assignedTo !== me) return route.fulfill({ status: 409, json: { code: 'conflict:chat' } });
      return route.fulfill({ status: 201, json: { message: say(id, 'human_agent', body.text, me) } });
    }
    if (action === 'release') {
      if (target.assignedTo !== me) return route.fulfill({ status: 409, json: { code: 'conflict:chat' } });
      Object.assign(target, {
        handledBy: 'ai_agent',
        assignedTo: null,
        closedAt: body.outcome === 'resolved' ? now() : null,
      });
      say(id, 'system', body.outcome === 'resolved' ? 'La conversación se cerró.' : 'Volviste con el asistente.');
      return route.fulfill({ json: { chat: target } });
    }
    return route.fulfill({ status: 400, json: {} });
  });
  return requested;
}

async function openConsole(page: Page, role: Role = 'advisor', email = ME) {
  await mockSessionRole(page, role, email);
  const requested = await mockAdvisorApi(page, email, role);
  await page.goto('/conversations');
  return requested;
}

const rows = (page: Page) => page.locator('[data-testid^="conversation-row-"]');
// The header shows state only when the chat needs attention or changed hands.
const headerStatus = (page: Page) => page.locator('header').getByTestId('attention');
const input = (page: Page) => page.getByLabel('Mensaje al cliente');

test.describe('Advisor console', () => {
  test('the inbox groups by handoff reason and each view asks for its params', async ({ page }) => {
    const requested = await openConsole(page);
    await expect(page.getByTestId('inbox-title')).toHaveText('Bandeja');
    // Only the cases that need a person: David's own chat isn't here.
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('conversation-row-c-assistant')).toHaveCount(0);
    // Sections by handoff reason; the ones without a handoff go in "Otros".
    await expect(page.getByTestId('inbox-section-complaint').getByTestId('conversation-row-c-waiting')).toBeVisible();
    await expect(page.getByTestId('reason-chip-complaint')).toHaveText('Reclamo');
    await expect(page.getByTestId('inbox-section-retention')).toHaveCount(0);
    await expect(page.getByTestId('reason-chip-NONE')).toHaveText('Otros');
    await expect(page.getByTestId('inbox-section-NONE').getByTestId('conversation-row-c-race')).toBeVisible();
    await expect(page.getByTestId('inbox-section-NONE').getByTestId('conversation-row-c-other')).toBeVisible();

    await page.getByTestId('view-waiting').click();
    await expect(rows(page)).toHaveCount(2);
    expect(requested.some((u) => u.includes('handledBy=human_queue'))).toBe(true);

    // Each customer's latest closed conversation: Daniela's c-old and Marta's.
    await page.getByTestId('view-resolved').click();
    await expect(rows(page)).toHaveCount(2);
    expect(requested.some((u) => u.includes('status=closed'))).toBe(true);

    await page.getByTestId('view-reason-complaint').click();
    await expect(page.getByTestId('inbox-title')).toHaveText('Reclamo');
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId('conversation-row-c-waiting')).toBeVisible();
    expect(requested.some((u) => u.includes('handoffReason=complaint'))).toBe(true);

    // Con asesor lists every chat in human_agent, also the ones held by others.
    await page.getByTestId('view-advisor').click();
    await expect(page.getByTestId('inbox-title')).toHaveText('Con asesor');
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId('conversation-row-c-other')).toBeVisible();
    expect(requested.some((u) => u.includes('handledBy=human_agent') && u.includes('status=open'))).toBe(true);
    await expect(page.getByTestId('view-mine')).toHaveCount(0);

    await page.getByTestId('view-david').click();
    await expect(page.getByTestId('inbox-title')).toHaveText('Con AI');
    await expect(page.getByTestId('view-david')).toContainText('Con AI');
    await expect(page.getByTestId('view-waiting')).toContainText('En espera');
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId('conversation-row-c-assistant')).toBeVisible();
    expect(requested.some((u) => u.includes('handledBy=ai_agent') && u.includes('status=open'))).toBe(true);
  });

  test('the views show how many conversations they have', async ({ page }) => {
    await openConsole(page);
    await expect(page.getByTestId('view-inbox-count')).toHaveText('3');
    await expect(page.getByTestId('view-david-count')).toHaveText('1');
    await expect(page.getByTestId('view-waiting-count')).toHaveText('2');
    await expect(page.getByTestId('view-resolved-count')).toHaveText('2');
    await expect(page.getByTestId('view-advisor-count')).toHaveText('1');
    // Exactly three reason filters, each with its counter, zero included.
    await expect(page.locator('[data-testid^="view-reason-"]:not([data-testid$="-count"])')).toHaveCount(3);
    await expect(page.getByTestId('view-reason-complaint')).toContainText('Reclamo');
    await expect(page.getByTestId('view-reason-retention')).toContainText('Cancelación de producto');
    await expect(page.getByTestId('view-reason-case_status')).toContainText('Estado de un reclamo');
    await expect(page.getByTestId('view-reason-complaint-count')).toHaveText('1');
    // Daniela's resolved retention handoff is not her ongoing conversation.
    await expect(page.getByTestId('view-reason-retention-count')).toHaveText('0');
    await expect(page.getByTestId('view-reason-case_status-count')).toHaveText('0');
    await expect(page.getByTestId('view-use-case-GENERAL_INQUIRY')).toHaveCount(0);

    // Taking a chat updates the counters.
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    await page.getByTestId('assistant-switch').click();
    await expect(page.getByTestId('view-advisor-count')).toHaveText('2');
  });

  test('only the ongoing conversation counts for the reason filters', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('view-reason-retention').click();
    await expect(page.getByTestId('inbox-title')).toHaveText('Cancelación de producto');
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByTestId('conversation-row-c-old')).toHaveCount(0);
    await expect(page.getByTestId('conversation-row-c-waiting')).toHaveCount(0);
  });

  test('opening a chat shows it beside the list, and X closes it', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    await expect(page.getByTestId('customer-meta')).toBeVisible();
    // On a laptop the context panel takes the list's place; closing it brings the list back.
    await expect(rows(page).first()).toBeHidden();
    await page.getByTestId('context-toggle').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toBeVisible();
    await page.getByTestId('close-conversation').click();
    await expect(page.getByTestId('customer-meta')).toHaveCount(0);
  });

  test('turning the assistant off takes the chat and lets the advisor reply', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    await expect(input(page)).toBeDisabled();

    await page.getByTestId('assistant-switch').click();
    await expect(headerStatus(page)).toHaveText('Con asesor · la atiendes tú');
    await expect(page.getByTestId('system-notice').last()).toContainText('Te atiende un asesor.');
    await expect(input(page)).toBeEnabled();

    await input(page).fill('Hola Javier, te escribe un asesor.');
    await input(page).press('Enter');
    await expect(page.getByTestId('bubble-advisor').last()).toHaveText('Tú');
    await expect(page.getByTestId('bubble-agent').last()).toContainText('te escribe un asesor');
  });

  test('taking a waiting chat, returning it and resolving', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('conversation-row-c-waiting').click();
    await page.getByTestId('take-button').click();
    await expect(headerStatus(page)).toHaveText('Con asesor · la atiendes tú');

    await page.getByTestId('assistant-switch').click();
    await expect(headerStatus(page)).toHaveText('Con AI');
    await expect(input(page)).toBeDisabled();
    await expect(page.getByTestId('system-notice').last()).toContainText('Volviste con el asistente.');

    await page.getByTestId('assistant-switch').click();
    await page.getByTestId('resolve-button').click();
    await expect(headerStatus(page)).toHaveText('Resuelta');
    await expect(page.getByTestId('system-notice').last()).toContainText('La conversación se cerró.');
  });

  test('a 409 on take says who holds the chat', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('conversation-row-c-race').click();
    await page.getByTestId('take-button').click();
    await expect(page.getByText(`Ya la atiende ${OTHER}.`)).toBeVisible();
    await expect(input(page)).toBeDisabled();
  });

  test('a chat held by someone else is read-only for an advisor', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('conversation-row-c-other').click();
    await expect(page.getByTestId('customer-meta')).toContainText(`Con asesor · ${OTHER}`);
    await expect(input(page)).toBeDisabled();
    await expect(page.getByTestId('force-take-button')).toHaveCount(0);
  });

  test('the admin supervises everything and attends like an advisor', async ({ page }) => {
    const requested = await openConsole(page, 'admin', 'root@example.com');
    await expect(page.getByTestId('nav-admin')).toHaveCount(0);
    await expect(page.getByTestId('inbox-title')).toHaveText('Bandeja');
    await expect(page.getByTestId('view-advisor')).toBeVisible();
    await expect(rows(page)).toHaveCount(3);

    // Waiting: the admin takes it, replies and resolves it.
    await page.getByTestId('conversation-row-c-waiting').click();
    await expect(page.getByTestId('read-only-badge')).toHaveCount(0);
    await page.getByTestId('take-button').click();
    await expect(input(page)).toBeEnabled();
    await input(page).fill('Hola, soy el administrador.');
    await input(page).press('Enter');
    await expect(page.getByText('Hola, soy el administrador.')).toBeVisible();
    await page.getByTestId('view-advisor').click();
    await expect(rows(page)).toHaveCount(2);
    await page.getByTestId('conversation-row-c-waiting').click();
    await page.getByTestId('resolve-button').click();
    await expect(page.getByTestId('customer-meta')).toContainText('Resuelta');

    // Held by another advisor: no controls, no force.
    await page.getByTestId('view-inbox').click();
    await page.getByTestId('user-filter').click();
    await page.getByTestId('user-option-c-other-user').click();
    await expect(rows(page)).toHaveCount(1);
    expect(requested.some((u) => u.includes('userId=c-other-user'))).toBe(true);
    await page.getByTestId('conversation-row-c-other').click();
    await expect(page.getByTestId('status-banner')).toContainText(`La atiende ${OTHER}`);
    for (const id of ['assistant-switch', 'take-button', 'resolve-button', 'force-take-button']) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(input(page)).toBeDisabled();
  });

  test('shows David typing while a customer message has no reply', async ({ page }) => {
    await openConsole(page);
    // The customer just wrote to David and he hasn't answered yet.
    await page.route('**/api/advisor/conversations/c-assistant/messages**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const after = new URL(route.request().url()).searchParams.get('after');
      return route.fulfill({
        json: after
          ? []
          : [
              {
                id: 'm-pending',
                chatId: 'c-assistant',
                role: 'user',
                parts: [{ type: 'text', text: '¿Cuál es mi saldo?' }],
                createdAt: new Date().toISOString(),
                senderType: 'customer',
                senderId: null,
              },
            ],
      });
    });
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    await expect(page.getByTestId('bubble-customer').last()).toContainText('¿Cuál es mi saldo?');
    await expect(page.getByTestId('typing-indicator')).toBeVisible();

    // A resolved chat shows no indicator, even with the customer last.
    await page.getByTestId('view-resolved').click();
    await page.getByTestId('conversation-row-c-closed').click();
    await expect(page.getByTestId('bubble-customer').first()).toBeVisible();
    await expect(page.getByTestId('typing-indicator')).toHaveCount(0);
  });

  test('an empty inbox says how many chats David has and links to them', async ({ page }) => {
    await openConsole(page, 'admin', 'root@example.com');
    // Javier only talks to David: nothing in his inbox needs a person.
    await page.getByTestId('user-filter').click();
    await page.getByTestId('user-option-c-assistant-user').click();
    await expect(page.getByTestId('inbox-empty-david')).toContainText('No hay casos para atender.');
    await page.getByTestId('inbox-empty-david-link').click();
    await expect(page.getByTestId('inbox-title')).toHaveText('Con AI');
    await expect(page.getByTestId('conversation-row-c-assistant')).toBeVisible();
  });

  test('the customer context panel shows the bank history beside the chat', async ({ page }) => {
    await openConsole(page);
    let fail = true;
    await page.route('**/api/advisor/conversations/c-waiting/customer-context', (route) =>
      fail
        ? route.fulfill({ status: 502, json: { code: 'bad_gateway' } })
        : route.fulfill({
            json: {
              customer: { customerId: 'CUS000123', firstName: 'Daniela', lastName: 'Sosa' },
              interactions: [
                { interactionId: 'INT1', hasTranscript: true, date: '2026-09-26T11:42:00.000Z', interactionType: 'Inbound Call', channel: 'Phone', reason: 'Cargo duplicado', resolved: false, escalated: true, sentiment: 'Negative' },
                { interactionId: 'INT2', hasTranscript: false, date: '2026-09-20T18:05:00.000Z', interactionType: 'Outbound Call', channel: 'Phone', reason: null, resolved: true, escalated: null, sentiment: null },
              ],
              transcripts: [
                { interactionId: 'INT1', date: '2026-09-26', customerText: 'Me cobraron dos veces, tarjeta [NÚMERO OCULTO].', agentText: 'Le abro un reclamo.', language: 'es', intents: 'consulta_general', topics: 'Queja' },
              ],
              cases: [],
            },
          }),
    );

    // Open by default; a warehouse failure offers a retry and the chat still works.
    await page.getByTestId('conversation-row-c-waiting').click();
    await expect(page.getByTestId('context-error')).toBeVisible();
    await expect(page.getByTestId('take-button')).toBeEnabled();
    fail = false;
    await page.getByTestId('customer-context').getByRole('button', { name: 'Reintentar' }).click();

    const panel = page.getByTestId('customer-context');
    await expect(page.getByTestId('context-customer')).toHaveText('Daniela Sosa·Cliente •• 0123');
    // No cases: it opens on the first tab with something in it.
    await expect(page.getByTestId('context-tab-interactions')).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByTestId('context-interaction')).toHaveCount(2);
    await expect(page.getByTestId('context-tab-interactions')).toContainText('Interacciones');
    const [inbound, outbound] = [
      panel.getByTestId('context-interaction').first(),
      panel.getByTestId('context-interaction').last(),
    ];
    // Who called, and every recorded field translated one to one.
    await expect(inbound.getByTestId('interaction-type')).toHaveText('Llamada entrante: llamó el cliente');
    await expect(outbound.getByTestId('interaction-type')).toHaveText('Llamada saliente: llamó el banco');
    for (const text of ['CanalTeléfono', 'MotivoCargo duplicado', 'ResueltaNo', 'EscaladaSí', 'SentimientoNegativo']) {
      await expect(inbound).toContainText(text);
    }
    // Fields the bank didn't record aren't shown.
    await expect(outbound).not.toContainText('Motivo');
    await expect(outbound).not.toContainText('Escalada');

    // The call's transcript opens inside its interaction; no button without one.
    await expect(outbound.getByTestId('interaction-transcript-toggle')).toHaveCount(0);
    await inbound.getByTestId('interaction-transcript-toggle').click();
    const inline = inbound.getByTestId('interaction-transcript');
    for (const text of [
      'IdiomaEspañol',
      'Intencionesconsulta_general',
      'TemasQueja',
      'Cliente: Me cobraron dos veces, tarjeta [NÚMERO OCULTO].',
      'Agente: Le abro un reclamo.',
    ]) {
      await expect(inline).toContainText(text);
    }
    await inbound.getByTestId('interaction-transcript-toggle').click();
    await expect(inline).toHaveCount(0);

    await page.getByTestId('context-tab-cases').click();
    await expect(panel).toContainText('Sin casos ni reclamos registrados.');

    await page.getByTestId('context-tab-transcripts').click();
    await expect(page.getByTestId('context-tab-transcripts')).toContainText('Transcripciones');
    const transcript = panel.getByTestId('context-transcript');
    await expect(transcript).toContainText('IdiomaEspañol');
    await expect(transcript).toContainText('Intencionesconsulta_general');
    await expect(transcript).toContainText('TemasQueja');
    await transcript.getByRole('button', { name: /Ver texto/ }).click();
    await expect(transcript).toContainText('Cliente: Me cobraron dos veces, tarjeta [NÚMERO OCULTO].');
    await expect(transcript).toContainText('Agente: Le abro un reclamo.');

    // The toggle hides it and the choice sticks.
    await page.getByTestId('context-toggle').click();
    await expect(panel).toHaveCount(0);
    await page.reload();
    await page.getByTestId('conversation-row-c-waiting').click();
    await expect(page.getByTestId('context-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('customer-context')).toHaveCount(0);
  });

  test('a chat without a bank customer says so', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('conversation-row-c-other').click();
    await expect(page.getByTestId('context-none')).toContainText('no tiene un cliente del banco');
  });

  test('shows the bank customer by name, with the email as secondary', async ({ page }) => {
    await openConsole(page);
    const row = page.getByTestId('conversation-row-c-waiting');
    await expect(row.getByTestId('row-name')).toHaveText('Daniela Sosa Ruiz');
    await expect(row.getByTestId('row-name')).toHaveAttribute('title', 'daniela@banco.test');
    await expect(row).toContainText('DR');
    // Without a customer name the email stays the name.
    await expect(page.getByTestId('conversation-row-c-race').getByTestId('row-name')).toHaveText(
      'santiago@banco.test',
    );

    await page.getByLabel('Buscar cliente').fill('sosa');
    await expect(rows(page)).toHaveCount(1);
    await row.click();
    await expect(page.getByTestId('customer-name')).toHaveText('Daniela Sosa Ruiz');
    await expect(page.getByTestId('customer-email')).toHaveText('daniela@banco.test');
  });

  test('a customer is one row; opening it shows all their conversations in order', async ({ page }) => {
    const requested = await openConsole(page);
    await page.getByTestId('view-resolved').click();
    // Her latest closed conversation is c-old: she is here, and also in the inbox with c-waiting.
    await expect(page.getByTestId('conversation-row-c-old')).toHaveCount(1);
    await page.getByTestId('view-inbox').click();
    await expect(page.getByTestId('conversation-row-c-waiting')).toHaveCount(1);
    expect(requested.some((u) => u.includes('groupBy=customer'))).toBe(true);

    await page.getByTestId('conversation-row-c-waiting').click();
    const dividers = page.getByTestId('conversation-divider');
    await expect(dividers).toHaveCount(2);
    await expect(dividers.first()).toHaveAttribute('data-chat-id', 'c-old');
    await expect(dividers.first()).toContainText('Estado de un caso');
    await expect(dividers.first().getByTestId('divider-status')).toHaveText('Resuelta');
    await expect(dividers.last()).toHaveAttribute('data-chat-id', 'c-waiting');
    await expect(dividers.last().getByTestId('divider-status')).toHaveText('En espera');
    // The earlier conversation reads first, then the latest.
    const segments = page.getByTestId('timeline-segment');
    await expect(segments.first()).toContainText('Tu caso 48213 sigue en revisión.');
    await expect(segments.last()).toContainText('Mira ![](https://tracker.test/px.png)');

    // Actions apply to the latest conversation.
    await page.getByTestId('take-button').click();
    await expect(page.getByTestId('customer-meta')).toContainText('Con asesor · la atiendes tú');
    expect(requested.some((u) => u.includes('/c-waiting/take'))).toBe(true);
    expect(requested.some((u) => u.includes('/c-old/take'))).toBe(false);
    await expect(dividers.last().getByTestId('divider-status')).toHaveText('Con asesor');
  });

  test('a case David handed off shows its reason in the row and its record above the chat', async ({
    page,
  }) => {
    await openConsole(page);
    const row = page.getByTestId('conversation-row-c-waiting');
    // The row shows the case's detail, not the reason again.
    await expect(row.getByTestId('row-handoff')).toHaveText('Cobro duplicado');
    await expect(page.getByTestId('conversation-row-c-race').getByTestId('row-handoff')).toHaveCount(0);

    await row.click();
    const card = page.getByTestId('handoff-card').first();
    await expect(card.getByTestId('handoff-reason')).toHaveText('Reclamo por un cargo');
    await expect(card.getByTestId('handoff-summary')).toContainText('cobro duplicado');
    await expect(card.getByTestId('handoff-fact-card_last4')).toHaveText('••1070');
    await expect(card.getByTestId('handoff-fact-merchant')).toHaveText('SUPERMERCADO LÍDER');
    await expect(card.getByTestId('handoff-fact-transaction_date')).toHaveText('24 sep 2026');
    await expect(card.getByTestId('handoff-fact-amount')).toContainText('USD');
    await expect(card.getByTestId('handoff-fact-complaint_type')).toHaveText('Cobro duplicado');
    await expect(card.getByTestId('handoff-fact-description')).toHaveText('Me cobraron dos veces');

    // Folds away to leave room for the chat.
    await card.getByRole('button', { name: /Caso derivado por David/ }).click();
    await expect(card.getByTestId('handoff-facts')).toHaveCount(0);
  });

  test('/admin now leads to Chats', async ({ page }) => {
    await mockSessionRole(page, 'admin', 'root@example.com');
    await mockAdvisorApi(page, 'root@example.com', 'admin');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/conversations$/);
  });

  test('renders David\'s markdown: bullets and bold', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    const reply = page.getByTestId('bubble-agent').last();
    await expect(reply.locator('li')).toHaveCount(2);
    const bold = reply.getByText('1070', { exact: true });
    await expect(bold).toBeVisible();
    expect(Number(await bold.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600);
    await expect(reply).not.toContainText('**');
    const bullet = await reply
      .locator('ul')
      .evaluate((el) => getComputedStyle(el).listStyleType);
    expect(bullet).toBe('disc');
  });

  test('rows: robot for David, text state only when it needs attention', async ({ page }) => {
    await openConsole(page);
    const assistantRow = page.getByTestId('conversation-row-c-assistant');
    const waitingRow = page.getByTestId('conversation-row-c-waiting');
    await expect(waitingRow.getByTestId('attention')).toHaveText('En espera');
    await expect(waitingRow.getByTestId('waiting-dot')).toBeVisible();
    await expect(waitingRow.getByTestId('row-text')).toHaveText('Es urgente, por favor');
    await expect(waitingRow.getByTestId('row-text')).toHaveAttribute('title', 'Consulta de daniela');
    await expect(waitingRow.getByTestId('david-icon')).toHaveCount(0);
    await expect(page.getByTestId('conversation-row-c-other').getByTestId('attention')).toHaveText('Con asesor · ada');
    await expect(page.locator('body')).not.toContainText('Sin caso de uso');

    await page.getByTestId('view-david').click();
    await expect(assistantRow.getByTestId('david-icon')).toHaveAttribute('title', 'Con AI: lo atiende David');
    await expect(assistantRow.getByTestId('attention')).toHaveCount(0);
    await expect(assistantRow.getByTestId('row-text')).toHaveText('Consulta de javier');
    await expect(page.locator('body')).not.toContainText('Con David');
  });

  test('customer text is shown literally: no images or links', async ({ page }) => {
    const external: string[] = [];
    await page.route('https://tracker.test/**', (route) => {
      external.push(route.request().url());
      return route.abort();
    });
    await openConsole(page);
    await page.getByTestId('conversation-row-c-waiting').click();
    const bubble = page.getByTestId('bubble-customer').last();
    await expect(bubble).toContainText('![](https://tracker.test/px.png)');
    await expect(bubble).toContainText('[aquí](https://phishing.test/login)');
    await expect(bubble.locator('img')).toHaveCount(0);
    await expect(bubble.locator('a')).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test('a quick reply fills the message field', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    await page.getByTestId('assistant-switch').click();
    await page.getByRole('button', { name: 'Respuestas rápidas' }).click();
    await page.getByTestId('quick-reply-0').click();
    await expect(input(page)).toHaveValue('Ya revisé tu caso.');
  });
});

test.describe('Nav rail', () => {
  test('switches between the agent and the chats sections', async ({
    adaContext,
  }) => {
    const page = await adaContext.context.newPage();
    await mockSessionRole(page, 'advisor');
    const chatPage = new ChatPage(page);
    await chatPage.createNewChat();
    await expect(page.getByTestId('nav-agent')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByTestId('nav-chats').click();
    await expect(page).toHaveURL(/\/conversations$/);
    await expect(page.getByTestId('nav-chats')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByTestId('nav-agent').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(chatPage.multimodalInput).toBeVisible();
    await page.close();
  });
});
