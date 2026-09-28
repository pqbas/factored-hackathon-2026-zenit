// Mock data for the WhatsApp-style /conversations view. No back/agent calls;
// this is only for validating the UI ahead of the real conversations endpoint.
// Dates are computed relative to `new Date()` at module load so "Hoy" always
// has messages.

export type MockMessage = {
  id: string;
  from: 'customer' | 'agent';
  text: string;
  sentAt: string; // ISO
};

export type MockConversation = {
  customerId: string;
  name: string;
  country?: string;
  unread: number;
  messages: MockMessage[];
};

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
  from: MockMessage['from'],
  text: string,
  sentAt: string,
): MockMessage {
  messageSeq += 1;
  return { id: `mock-msg-${messageSeq}`, from, text, sentAt };
}

export const MOCK_CONVERSATIONS: MockConversation[] = [
  {
    customerId: 'demo-mx-1',
    name: 'Santiago · México',
    country: 'México',
    unread: 2,
    messages: [
      msg(
        'customer',
        'Hola, buenos días. ¿Me pueden confirmar el saldo de mi cuenta?',
        at(1, 9, 15),
      ),
      msg(
        'agent',
        'Buenos días, Santiago. Su saldo disponible es de $128,450.00 MXN (dato de demostración).',
        at(1, 9, 17),
      ),
      msg(
        'customer',
        'Perfecto, gracias. Quiero agregar un beneficiario nuevo para hacer una transferencia.',
        at(1, 9, 20),
      ),
      msg(
        'agent',
        'Claro, deme un momento y le indico los pasos para agregar al beneficiario.',
        at(1, 9, 25),
      ),
      msg(
        'customer',
        'Ya intenté agregarlo pero me sale un error en la app.',
        at(0, 10, 2),
      ),
      msg(
        'agent',
        'Gracias por avisarme. Estoy revisando el error con el equipo técnico.',
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
    name: 'Javier · Colombia',
    country: 'Colombia',
    unread: 0,
    messages: [
      msg(
        'customer',
        'Buenas tardes, quiero solicitar un aumento en el límite de mi tarjeta de crédito.',
        at(1, 14, 0),
      ),
      msg(
        'agent',
        'Buenas tardes, Javier. Con gusto reviso su historial para evaluar la solicitud.',
        at(1, 14, 3),
      ),
      msg(
        'agent',
        'Su línea de crédito actual es de $6,500,000 COP (dato de demostración). Puedo subirla hasta $9,000,000 COP.',
        at(1, 14, 10),
      ),
      msg(
        'customer',
        'Me parece bien, aceptamos el aumento a 9 millones.',
        at(1, 14, 12),
      ),
      msg(
        'agent',
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
    name: 'Daniela · Argentina',
    country: 'Argentina',
    unread: 3,
    messages: [
      msg(
        'customer',
        'Hola, necesito agregar un beneficiario nuevo para transferencias interbancarias.',
        at(2, 11, 0),
      ),
      msg(
        'agent',
        'Hola Daniela, claro. ¿Me confirma el CBU y el nombre completo del beneficiario?',
        at(2, 11, 5),
      ),
      msg(
        'customer',
        'CBU 0000003100012345678901, a nombre de Martín Pérez (dato de demostración).',
        at(2, 11, 10),
      ),
      msg(
        'agent',
        'El beneficiario ya quedó registrado. Puede hacer la transferencia cuando quiera.',
        at(1, 16, 0),
      ),
      msg(
        'customer',
        'Genial, hice la transferencia pero no veo el descuento reflejado en el saldo.',
        at(1, 16, 5),
      ),
      msg(
        'customer',
        '¿Podrían revisar? Ya pasaron varias horas.',
        at(0, 8, 30),
      ),
      msg(
        'customer',
        'Sigo esperando una respuesta, por favor.',
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
    unread: 0,
    messages: [
      msg(
        'customer',
        'Buenos días, me cerraron la cuenta y no entiendo por qué.',
        at(3, 10, 0),
      ),
      msg(
        'agent',
        'Buenos días. Reviso el caso, deme un momento por favor.',
        at(3, 10, 5),
      ),
      msg(
        'agent',
        'Veo que la cuenta se cerró por inactividad prolongada (dato de demostración).',
        at(3, 10, 20),
      ),
      msg(
        'customer',
        'Entiendo, ¿puedo reabrirla o debo abrir una nueva?',
        at(3, 10, 25),
      ),
      msg(
        'agent',
        'Debe abrir una cuenta nueva desde la app o en una sucursal.',
        at(3, 10, 30),
      ),
    ],
  },
  {
    customerId: 'demo-expired',
    name: 'Sesión vencida',
    unread: 0,
    messages: [
      msg(
        'customer',
        'Hola, no puedo ingresar a mi cuenta, dice que la sesión venció.',
        at(2, 9, 0),
      ),
      msg(
        'agent',
        'Hola, para reactivarla necesito verificar su identidad con 2 datos personales.',
        at(2, 9, 5),
      ),
      msg(
        'customer',
        'Claro, mi documento termina en 4521 y mi fecha de nacimiento es 03/05/1990 (datos de demostración).',
        at(2, 9, 10),
      ),
      msg(
        'agent',
        'Verificado. Ya puede volver a iniciar sesión con su usuario habitual.',
        at(2, 9, 15),
      ),
    ],
  },
];
