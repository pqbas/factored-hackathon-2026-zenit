// Mock data for the /conversations advisor console. No back/agent calls; this
// is only for validating the UI ahead of the real /handoffs API. The shape
// follows the agent's handoff model (agent/docs/07-handoff.md): `handledBy`
// mirrors `handled_by`, and handoffs leave a `system` message in the chat.
// Dates are computed relative to `new Date()` at module load so "Hoy" always
// has messages.

export type MessageSender = 'customer' | 'assistant' | 'advisor' | 'system';

export type MockAttachment = {
  url: string;
  alt: string;
  // Fields the back hid before the image reached the console.
  redactions: string[];
};

export type MockMessage = {
  id: string;
  from: MessageSender;
  text: string;
  sentAt: string; // ISO
  attachment?: MockAttachment;
};

export type HandledBy = 'ai_agent' | 'human_queue' | 'human_agent';

export type MockConversation = {
  customerId: string;
  name: string;
  phone: string;
  channel: 'WhatsApp' | 'App';
  handledBy: HandledBy;
  closed: boolean;
  topic: string;
  product?: string;
  tags: string[];
  unread: number;
  messages: MockMessage[];
};

export const QUICK_REPLIES = [
  'Ya revisé tu comprobante.',
  'La transferencia se acredita en 24 h hábiles.',
  'Abrí un reclamo y te aviso por aquí cuando tenga respuesta.',
  '¿Hay algo más en lo que te pueda ayudar?',
];

const now = new Date();

// Builds an ISO timestamp `daysAgo` days before now, at the given local time.
function at(daysAgo: number, hour: number, minute: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

let messageSeq = 0;
function msg(
  from: MessageSender,
  text: string,
  sentAt: string,
  attachment?: MockAttachment,
): MockMessage {
  messageSeq += 1;
  return { id: `mock-msg-${messageSeq}`, from, text, sentAt, attachment };
}

export const MOCK_CONVERSATIONS: MockConversation[] = [
  {
    customerId: 'demo-mx-1',
    name: 'Santiago Martínez',
    phone: '+52 55 5512 3390',
    channel: 'WhatsApp',
    handledBy: 'human_queue',
    closed: false,
    topic: 'Beneficiarios',
    product: 'Cuenta corriente •• 1182',
    tags: [],
    unread: 2,
    messages: [
      msg(
        'customer',
        'Hola, buenos días. ¿Me pueden confirmar el saldo de mi cuenta?',
        at(1, 9, 15),
      ),
      msg(
        'assistant',
        'Buenos días, Santiago. Su saldo disponible es de $128,450.00 MXN (dato de demostración).',
        at(1, 9, 17),
      ),
      msg(
        'customer',
        'Perfecto, gracias. Quiero agregar un beneficiario nuevo para hacer una transferencia.',
        at(1, 9, 20),
      ),
      msg(
        'assistant',
        'Claro, deme un momento y le indico los pasos para agregar al beneficiario.',
        at(1, 9, 25),
      ),
      msg(
        'customer',
        'Ya intenté agregarlo pero me sale un error en la app.',
        at(0, 10, 2),
      ),
      msg(
        'assistant',
        'No pude registrar al beneficiario desde aquí. Le paso con un asesor.',
        at(0, 10, 5),
      ),
      msg(
        'system',
        'El asistente derivó a un asesor · falló el registro del beneficiario',
        at(0, 10, 5),
      ),
      msg(
        'customer',
        '¿Alguna novedad? Necesito hacer la transferencia hoy.',
        at(0, 10, 40),
      ),
      msg('customer', 'Es urgente, por favor.', at(0, 10, 41)),
    ],
  },
  {
    customerId: 'demo-co-1',
    name: 'Javier Gómez',
    phone: '+57 310 555 7712',
    channel: 'App',
    handledBy: 'ai_agent',
    closed: false,
    topic: 'Límite',
    product: 'Tarjeta de crédito •• 5521',
    tags: [],
    unread: 0,
    messages: [
      msg(
        'customer',
        'Buenas tardes, quiero solicitar un aumento en el límite de mi tarjeta de crédito.',
        at(1, 14, 0),
      ),
      msg(
        'assistant',
        'Buenas tardes, Javier. Con gusto reviso su historial para evaluar la solicitud.',
        at(1, 14, 3),
      ),
      msg(
        'assistant',
        'Su línea de crédito actual es de $6,500,000 COP (dato de demostración). Puedo subirla hasta $9,000,000 COP.',
        at(1, 14, 10),
      ),
      msg(
        'customer',
        'Me parece bien, aceptamos el aumento a 9 millones.',
        at(1, 14, 12),
      ),
      msg(
        'assistant',
        'Listo, Javier. El aumento de límite ya quedó aplicado en su tarjeta.',
        at(0, 9, 0),
      ),
      msg(
        'customer',
        'Excelente, muchas gracias por la ayuda.',
        at(0, 9, 5),
      ),
    ],
  },
  {
    customerId: 'demo-ar-1',
    name: 'Daniela Sosa',
    phone: '+54 9 11 5555 4821',
    channel: 'WhatsApp',
    handledBy: 'human_queue',
    closed: false,
    topic: 'Transferencia',
    product: 'Cuenta corriente •• 0800',
    tags: [],
    unread: 3,
    messages: [
      msg(
        'customer',
        'Hola, ayer hice una transferencia de $45.000 y todavía no le llegó a mi hermana.',
        at(1, 18, 30),
      ),
      msg(
        'assistant',
        'Lo reviso. ¿Me compartes el comprobante de la transferencia?',
        at(1, 18, 31),
      ),
      msg('customer', '', at(0, 8, 30), {
        url: '/mock-attachments/comprobante-transferencia.svg',
        alt: 'Comprobante de transferencia por $45.000',
        redactions: ['código de seguridad'],
      }),
      msg('customer', 'Ahí está.', at(0, 8, 30)),
      msg(
        'system',
        'El asistente derivó a un asesor · reclamo de transferencia',
        at(0, 8, 31),
      ),
      msg(
        'customer',
        'Es urgente, necesito saber si el dinero llegó.',
        at(0, 8, 32),
      ),
    ],
  },
  {
    customerId: 'demo-closed',
    name: 'Cliente cerrado',
    phone: '+54 9 351 555 1020',
    channel: 'App',
    handledBy: 'ai_agent',
    closed: true,
    topic: 'Cuenta cerrada',
    tags: [],
    unread: 0,
    messages: [
      msg(
        'customer',
        'Buenos días, me cerraron la cuenta y no entiendo por qué.',
        at(3, 10, 0),
      ),
      msg(
        'system',
        'El asistente derivó a un asesor · el cliente pidió hablar con una persona',
        at(3, 10, 1),
      ),
      msg(
        'advisor',
        'Buenos días. Reviso el caso, deme un momento por favor.',
        at(3, 10, 5),
      ),
      msg(
        'advisor',
        'Veo que la cuenta se cerró por inactividad prolongada (dato de demostración).',
        at(3, 10, 20),
      ),
      msg(
        'customer',
        'Entiendo, ¿puedo reabrirla o debo abrir una nueva?',
        at(3, 10, 25),
      ),
      msg(
        'advisor',
        'Debe abrir una cuenta nueva desde la app o en una sucursal.',
        at(3, 10, 30),
      ),
      msg('system', 'Conversación resuelta · vuelve al asistente', at(3, 10, 31)),
    ],
  },
  {
    customerId: 'demo-expired',
    name: 'Sesión vencida',
    phone: '+52 33 5550 8844',
    channel: 'App',
    handledBy: 'ai_agent',
    closed: false,
    topic: 'Acceso',
    tags: [],
    unread: 0,
    messages: [
      msg(
        'customer',
        'Hola, no puedo ingresar a mi cuenta, dice que la sesión venció.',
        at(2, 9, 0),
      ),
      msg(
        'assistant',
        'Hola, para reactivarla necesito verificar su identidad con 2 datos personales.',
        at(2, 9, 5),
      ),
      msg(
        'customer',
        'Claro, mi documento termina en 4521 y mi fecha de nacimiento es 03/05/1990 (datos de demostración).',
        at(2, 9, 10),
      ),
      msg(
        'assistant',
        'Verificado. Ya puede volver a iniciar sesión con su usuario habitual.',
        at(2, 9, 15),
      ),
    ],
  },
];
