import type { ChatMessage } from '@chat-template/core';
import type { Chat } from '@chat-template/db';
import { subDays, subHours, subMinutes } from 'date-fns';

// Demo chat history for the Agente section, seen from the bank customer's
// side: the customer (user) talks to the banking agent (assistant). All data
// is fake. Ids are fixed UUIDs so they fit the Chat table if a chat is
// continued with the database on.

interface MockAgentChat {
  chat: Chat;
  messages: ChatMessage[];
}

type Turn = ['user' | 'assistant', string];

function buildChat(
  id: string,
  title: string,
  createdAt: Date,
  turns: Turn[],
): MockAgentChat {
  return {
    chat: {
      id,
      title,
      createdAt,
      userId: 'mock-user',
      visibility: 'private',
      lastContext: null,
      stage: null,
      intent: null,
      customerName: null,
    },
    messages: turns.map(([role, text], index) => ({
      id: `${id.slice(0, -4)}${String(index).padStart(4, '0')}`,
      role,
      parts: [{ type: 'text', text }],
      metadata: {
        createdAt: subMinutes(createdAt, turns.length - index).toISOString(),
      },
    })),
  };
}

const now = new Date();

export const MOCK_AGENT_CHATS: MockAgentChat[] = [
  buildChat(
    '00000000-0000-4000-8000-000000000001',
    'Consulta de saldo',
    subMinutes(now, 25),
    [
      ['user', 'Hola, ¿cuánto saldo tengo en mi cuenta de ahorros?'],
      [
        'assistant',
        'Hola, Santiago. Tu cuenta de ahorros terminada en 4821 tiene un saldo disponible de **$128,450.00 MXN** (dato de demostración).',
      ],
      ['user', '¿Y cuánto gasté este mes con la tarjeta de débito?'],
      [
        'assistant',
        'En lo que va del mes registras 14 compras con tu tarjeta de débito por un total de **$9,812.30 MXN**. La más alta fue de $2,340.00 en un supermercado.',
      ],
    ],
  ),
  buildChat(
    '00000000-0000-4000-8000-000000000002',
    'Agregar un beneficiario',
    subHours(now, 3),
    [
      ['user', 'Quiero agregar a mi hermana como beneficiaria para transferirle.'],
      [
        'assistant',
        'Claro. Necesito el nombre completo de tu hermana, el banco y su número de cuenta o CLABE.',
      ],
      ['user', 'Mariana López Ruiz, Banco Demo, CLABE 012345678901234567.'],
      [
        'assistant',
        'Listo. Registré a **Mariana López Ruiz** como beneficiaria. Por seguridad, podrás transferirle a partir de mañana a las 9:00.',
      ],
    ],
  ),
  buildChat(
    '00000000-0000-4000-8000-000000000003',
    'Aumento de límite de crédito',
    subDays(now, 1),
    [
      ['user', 'Me gustaría subir el límite de mi tarjeta de crédito.'],
      [
        'assistant',
        'Tu límite actual es de $45,000.00 MXN. ¿A cuánto te gustaría aumentarlo?',
      ],
      ['user', 'A 60 mil, por favor.'],
      [
        'assistant',
        'Envié la solicitud de aumento a **$60,000.00 MXN**. Te avisaremos del resultado en un máximo de 48 horas.',
      ],
      ['user', 'Perfecto, gracias.'],
    ],
  ),
  buildChat(
    '00000000-0000-4000-8000-000000000004',
    'Tarjeta perdida',
    subDays(now, 4),
    [
      ['user', 'Perdí mi tarjeta de débito, ¿la pueden bloquear?'],
      [
        'assistant',
        'Lamento lo ocurrido. Bloqueé tu tarjeta terminada en 7735 de forma temporal. ¿Quieres que pida una reposición?',
      ],
      ['user', 'Sí, mándenmela a mi domicilio.'],
      [
        'assistant',
        'Solicité la reposición. Llegará a tu domicilio registrado en 5 a 7 días hábiles.',
      ],
    ],
  ),
  buildChat(
    '00000000-0000-4000-8000-000000000005',
    'Cargo no reconocido',
    subDays(now, 12),
    [
      ['user', 'Tengo un cargo de $1,299 que no reconozco en mi estado de cuenta.'],
      [
        'assistant',
        'Veo un cargo de $1,299.00 MXN del 3 de este mes en "SERVICIO DIGITAL DEMO". ¿Quieres iniciar una aclaración?',
      ],
      ['user', 'Sí, por favor.'],
      [
        'assistant',
        'Abrí la aclaración con folio **ACL-204518**. Te daremos respuesta en un máximo de 10 días hábiles.',
      ],
    ],
  ),
  buildChat(
    '00000000-0000-4000-8000-000000000006',
    'Sesión vencida',
    subDays(now, 40),
    [
      ['user', '¿Me puedes decir mis últimos movimientos?'],
      [
        'assistant',
        'Tu sesión expiró. Vuelve a iniciar sesión y retomamos tu solicitud.',
      ],
    ],
  ),
];

export function getMockAgentChat(id: string): MockAgentChat | undefined {
  return MOCK_AGENT_CHATS.find((mock) => mock.chat.id === id);
}
