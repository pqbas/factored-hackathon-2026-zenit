import { ASSISTANT_NAME } from '@/lib/assistant';

// The customer's chat screen in Spanish or Portuguese. The advisor console,
// metrics and products stay in Spanish.
export type Lang = 'es' | 'pt';

export const LANGS: Lang[] = ['es', 'pt'];

export function isLang(value: unknown): value is Lang {
  return value === 'es' || value === 'pt';
}

export type SuggestedAction = { title: string; description: string; prompt: string };

const es = {
  greeting: (hour: number): string =>
    hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches',
  intro: `Soy ${ASSISTANT_NAME}, tu asistente virtual. ¿En qué te puedo ayudar hoy?`,
  actions: [
    {
      title: 'Consultar saldo y movimientos de tarjeta',
      description: 'Saldo, límite y cupo disponible',
      prompt: 'Quiero ver el saldo y los movimientos de mi tarjeta de crédito',
    },
    {
      title: 'Cuentas de ahorro',
      description: 'Saldo y movimientos',
      prompt: 'Quiero ver el saldo y los movimientos de mi cuenta de ahorro',
    },
    {
      title: 'Presentar un reclamo',
      description: 'Un cargo que no reconoces o un cobro duplicado',
      prompt: 'Quiero presentar un reclamo por un cargo',
    },
    {
      title: 'Más opciones',
      description: 'Cancelar un producto o el estado de un reclamo',
      prompt: 'Más opciones: cancelar un producto o ver el estado de un reclamo',
    },
  ] as SuggestedAction[],
  placeholder: 'Mensaje',
  securityNotice: 'Nunca te pediremos tu contraseña, tu NIP ni el CVV.',
  waitForReply: `Espera a que ${ASSISTANT_NAME} termine de responder.`,
  assistantKind: 'Asistente virtual',
  online: 'En línea',
  unavailable: 'No disponible',
  advisor: 'Asesor',
  advisorAttending: 'Te atiende una persona',
  advisorWaiting: 'Esperando a un asesor',
  newChat: 'Nueva conversación',
  notSaved: 'Sin guardar',
  historyOff: 'El historial está desactivado: esta conversación no se guarda',
  agentUnavailable: `${ASSISTANT_NAME} no está disponible en este momento. Intenta de nuevo en unos segundos.`,
  handoffQueued: 'Te pasamos con un asesor. Te va a responder en este chat.',
  handoffTaken: 'Te atiende un asesor.',
  demoCustomer: 'Cliente demo:',
  pickDemoCustomer: 'Elegir cliente demo',
  demoCustomerHint: 'Clientes del dataset sintético del hackathon: elige a cuál simular',
  demoCustomerLocked: 'Queda fijo desde el primer mensaje del chat.',
  demoDataset: 'Dataset sintético del hackathon',
  language: 'Idioma',
  conversations: 'Conversaciones',
  noConversations: 'Todavía no hay conversaciones.',
  today: 'Hoy',
  yesterday: 'Ayer',
  last7Days: 'Últimos 7 días',
  last30Days: 'Últimos 30 días',
  older: 'Anteriores',
  loading: 'Cargando…',
  deleteTitle: '¿Eliminar esta conversación?',
  deleteDescription:
    'Esta acción no se puede deshacer. La conversación se borrará de forma permanente.',
  cancel: 'Cancelar',
  delete: 'Eliminar',
  deleting: 'Eliminando conversación…',
  deleted: 'Conversación eliminada',
  deleteFailed: 'No se pudo eliminar la conversación',
};

export type Messages = typeof es;

const pt: Messages = {
  greeting: (hour: number) => (hour < 12 ? 'Bom dia' : hour < 19 ? 'Boa tarde' : 'Boa noite'),
  intro: `Sou ${ASSISTANT_NAME}, seu assistente virtual. Como posso ajudar hoje?`,
  actions: [
    {
      title: 'Consultar saldo e movimentações do cartão',
      description: 'Saldo, limite e crédito disponível',
      prompt: 'Quero ver o saldo e as movimentações do meu cartão de crédito',
    },
    {
      title: 'Contas poupança',
      description: 'Saldo e movimentações',
      prompt: 'Quero ver o saldo e as movimentações da minha conta poupança',
    },
    {
      title: 'Registrar uma reclamação',
      description: 'Uma cobrança que você não reconhece ou uma cobrança duplicada',
      prompt: 'Quero registrar uma reclamação por uma cobrança',
    },
    {
      title: 'Mais opções',
      description: 'Cancelar um produto ou o status de uma reclamação',
      prompt: 'Mais opções: cancelar um produto ou ver o status de uma reclamação',
    },
  ],
  placeholder: 'Mensagem',
  securityNotice: 'Nunca vamos pedir sua senha, seu PIN nem o CVV.',
  waitForReply: `Espere ${ASSISTANT_NAME} terminar de responder.`,
  assistantKind: 'Assistente virtual',
  online: 'Online',
  unavailable: 'Indisponível',
  advisor: 'Atendente',
  advisorAttending: 'Uma pessoa está atendendo você',
  advisorWaiting: 'Aguardando um atendente',
  newChat: 'Nova conversa',
  notSaved: 'Sem salvar',
  historyOff: 'O histórico está desativado: esta conversa não é salva',
  agentUnavailable: `${ASSISTANT_NAME} não está disponível no momento. Tente de novo em alguns segundos.`,
  handoffQueued: 'Vamos transferir você para um atendente. Ele vai responder neste chat.',
  handoffTaken: 'Um atendente está atendendo você.',
  demoCustomer: 'Cliente demo:',
  pickDemoCustomer: 'Escolher cliente demo',
  demoCustomerHint: 'Clientes do dataset sintético do hackathon: escolha qual simular',
  demoCustomerLocked: 'Fica fixo a partir da primeira mensagem do chat.',
  demoDataset: 'Dataset sintético do hackathon',
  language: 'Idioma',
  conversations: 'Conversas',
  noConversations: 'Ainda não há conversas.',
  today: 'Hoje',
  yesterday: 'Ontem',
  last7Days: 'Últimos 7 dias',
  last30Days: 'Últimos 30 dias',
  older: 'Anteriores',
  loading: 'Carregando…',
  deleteTitle: 'Excluir esta conversa?',
  deleteDescription: 'Esta ação não pode ser desfeita. A conversa será apagada permanentemente.',
  cancel: 'Cancelar',
  delete: 'Excluir',
  deleting: 'Excluindo conversa…',
  deleted: 'Conversa excluída',
  deleteFailed: 'Não foi possível excluir a conversa',
};

export const MESSAGES: Record<Lang, Messages> = { es, pt };

// Demo customers are labelled "Name · Country".
export function langFromCustomerLabel(label: string | null | undefined): Lang | null {
  const country = label?.split('·')[1]?.trim().toLowerCase();
  if (!country) return null;
  return country === 'brasil' || country === 'brazil' ? 'pt' : 'es';
}

// Without a saved choice: the demo customer's country, else the browser,
// else Spanish.
export function defaultLang({
  customerLabel,
  navigatorLanguage,
}: {
  customerLabel?: string | null;
  navigatorLanguage?: string | null;
}): Lang {
  const byCustomer = langFromCustomerLabel(customerLabel);
  if (byCustomer) return byCustomer;
  return navigatorLanguage?.toLowerCase().startsWith('pt') ? 'pt' : 'es';
}
