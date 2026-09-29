// The fixed replies of docs/flujo-atencion.md §3, copied from
// agent/src/prompts/messages.py (SESSION_REJECTED, GUARDRAIL_REPLIES and
// CANCEL_REPLY). A turn that answers with one never reached the LLM. If the
// agent rewords them, the F cases fail and it shows, instead of passing
// silently: update this file with the agent's.

export const SESSION_REJECTED = {
  missing:
    'Para ayudarte necesito que inicies sesión en la banca digital. Por seguridad no puedo identificarte solo por lo que escribes en el chat.',
  invalid:
    'No pude verificar tu sesión. Vuelve a iniciar sesión en la banca digital para continuar.',
  expired:
    'Tu sesión expiró. Vuelve a iniciar sesión y retomamos tu solicitud.',
} as const;

export const GUARDRAIL_REPLIES = {
  PROMPT_INJECTION: {
    es: 'No puedo seguir instrucciones que vengan dentro de un mensaje del cliente. Cuéntame en qué puedo ayudarte con tu cuenta.',
    pt: 'Não posso seguir instruções que venham dentro de uma mensagem do cliente. Me diga em que posso ajudar com sua conta.',
  },
  THIRD_PARTY_DATA: {
    es: 'Solo puedo ver y compartir información de tu propia cuenta, no de otras personas.',
    pt: 'Só posso ver e compartilhar informações da sua própria conta, não de outras pessoas.',
  },
  ABUSE: {
    es: 'Quiero ayudarte, pero necesito que sigamos la conversación con respeto.',
    pt: 'Quero ajudar você, mas preciso que continuemos a conversa com respeito.',
  },
  SENSITIVE_DATA: {
    es: 'Por tu seguridad, no compartas el número completo de tu tarjeta, el CVV ni tu contraseña por este chat. No guardé ese dato.',
    pt: 'Para sua segurança, não compartilhe o número completo do seu cartão, o CVV nem sua senha por este chat. Não salvei esse dado.',
  },
  CUSTOMER_RISK: {
    es: 'Esto suena a una posible estafa en curso. No transfieras dinero ni compartas más datos: un asesor te va a contactar cuanto antes.',
    pt: 'Isso parece um possível golpe em andamento. Não transfira dinheiro nem compartilhe mais dados: um atendente vai entrar em contato o quanto antes.',
  },
} as const;

export const CANCEL_REPLY = {
  es: 'Listo, lo dejamos ahí. Si necesitas algo más, escríbeme.',
  pt: 'Pronto, ficamos por aqui. Se precisar de mais alguma coisa, é só me escrever.',
} as const;

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

const FIXED = new Set(
  [
    ...Object.values(SESSION_REJECTED),
    ...Object.values(GUARDRAIL_REPLIES).flatMap((r) => Object.values(r)),
    ...Object.values(CANCEL_REPLY),
  ].map(normalize),
);

export function isFixedReply(text: string): boolean {
  return FIXED.has(normalize(text));
}

// Etapa 5: what David says when he hands off. Not a fixed reply for `F`: it
// marks the handoff message in the transcript.
export const HANDOFF_REPLY = {
  es: 'Te comunico con un asesor, que ya tiene los datos de tu caso.',
  pt: 'Vou transferir você para um atendente, que já tem os dados do seu caso.',
} as const;
