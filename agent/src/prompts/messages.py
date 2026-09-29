CANCEL_REPLY: dict[str, str] = {
    "es": "Listo, lo dejamos ahí. Si necesitas algo más, escríbeme.",
    "pt": "Pronto, ficamos por aqui. Se precisar de mais alguma coisa, é só me escrever.",
}

SESSION_REJECTED: dict[str, str] = {
    "missing": (
        "Para ayudarte necesito que inicies sesión en la banca digital. Por "
        "seguridad no puedo identificarte solo por lo que escribes en el chat."
    ),
    "invalid": (
        "No pude verificar tu sesión. Vuelve a iniciar sesión en la banca "
        "digital para continuar."
    ),
    "expired": "Tu sesión expiró. Vuelve a iniciar sesión y retomamos tu solicitud.",
}

# Fixed refusals for each guardrail category classify blocks on. "other" falls
# back to "es" in classify.py; see docs/04-guardrails.md §4.2.
GUARDRAIL_REPLIES: dict[str, dict[str, str]] = {
    "PROMPT_INJECTION": {
        "es": (
            "No puedo seguir instrucciones que vengan dentro de un mensaje del "
            "cliente. Cuéntame en qué puedo ayudarte con tu cuenta."
        ),
        "pt": (
            "Não posso seguir instruções que venham dentro de uma mensagem do "
            "cliente. Me diga em que posso ajudar com sua conta."
        ),
    },
    "THIRD_PARTY_DATA": {
        "es": "Solo puedo ver y compartir información de tu propia cuenta, no de otras personas.",
        "pt": "Só posso ver e compartilhar informações da sua própria conta, não de outras pessoas.",
    },
    "ABUSE": {
        "es": "Quiero ayudarte, pero necesito que sigamos la conversación con respeto.",
        "pt": "Quero ajudar você, mas preciso que continuemos a conversa com respeito.",
    },
    "SENSITIVE_DATA": {
        "es": (
            "Por tu seguridad, no compartas el número completo de tu tarjeta, el "
            "CVV ni tu contraseña por este chat. No guardé ese dato."
        ),
        "pt": (
            "Para sua segurança, não compartilhe o número completo do seu cartão, "
            "o CVV nem sua senha por este chat. Não salvei esse dado."
        ),
    },
    "CUSTOMER_RISK": {
        "es": (
            "Esto suena a una posible estafa en curso. No transfieras dinero ni "
            "compartas más datos: un asesor te va a contactar cuanto antes."
        ),
        "pt": (
            "Isso parece um possível golpe em andamento. Não transfira dinheiro "
            "nem compartilhe mais dados: um atendente vai entrar em contato o "
            "quanto antes."
        ),
    },
}

# docs/flujo-atencion.md, etapas 1 y 2: the greeting and the menu are fixed texts, so the
# options never change with the LLM's wording.
MENU: dict[str, str] = {
    "es": (
        "Tengo estas opciones para ayudarte:\n\n"
        "A) Tarjeta de crédito: saldo, límite, cupo disponible y movimientos\n"
        "B) Cuentas de ahorro: saldo y movimientos\n"
        "C) Reclamos: un cargo que no reconoces, un cobro duplicado o un monto distinto\n"
        "D) Más opciones: cancelar un producto, estado de un reclamo\n\n"
        "Escribe la letra de tu elección o cuéntame tu consulta."
    ),
    "pt": (
        "Tenho estas opções para ajudar você:\n\n"
        "A) Cartão de crédito: saldo, limite, limite disponível e movimentações\n"
        "B) Contas poupança: saldo e movimentações\n"
        "C) Reclamações: uma cobrança que você não reconhece, uma cobrança duplicada ou um valor diferente\n"
        "D) Mais opções: cancelar um produto, status de uma reclamação\n\n"
        "Escreva a letra da sua escolha ou me conte sua dúvida."
    ),
}

GREETING_REPLY: dict[str, str] = {
    "es": "¡Hola! Soy David, tu asistente virtual del banco.",
    "pt": "Olá! Sou o David, seu assistente virtual do banco.",
}

# 3.A and 3.B, step 2: what the customer wants from the product they picked by its letter.
CARD_OPTIONS: dict[str, str] = {
    "es": "¿Qué quieres ver de tu tarjeta de crédito?\n\n1) Saldo, límite y cupo disponible\n2) Movimientos",
    "pt": "O que você quer ver do seu cartão de crédito?\n\n1) Saldo, limite e limite disponível\n2) Movimentações",
}

SAVINGS_OPTIONS: dict[str, str] = {
    "es": "¿Qué quieres ver de tus cuentas de ahorro?\n\n1) Saldo\n2) Movimientos",
    "pt": "O que você quer ver das suas contas poupança?\n\n1) Saldo\n2) Movimentações",
}

MORE_OPTIONS: dict[str, str] = {
    "es": "¿Qué necesitas?\n\n1) Cancelar un producto\n2) Ver el estado de un reclamo",
    "pt": "Do que você precisa?\n\n1) Cancelar um produto\n2) Ver o status de uma reclamação",
}

# §3, regla 6: anything outside the menu gets one short line and the menu again, never a handoff.
OUT_OF_MENU: dict[str, str] = {
    "es": "No puedo ayudarte con eso por aquí.",
    "pt": "Não posso ajudar com isso por aqui.",
}

# A request for a person without an operation: David asks what it's about, through the menu.
HUMAN_WITHOUT_TOPIC: dict[str, str] = {
    "es": "Cuéntame qué necesitas y te ayudo.",
    "pt": "Me conte do que você precisa e eu ajudo.",
}

# Options of the menu that aren't built yet (3.C, 3.D1, 3.D2 until their blocks ship).
NOT_YET_AVAILABLE: dict[str, str] = {
    "es": "Esa opción todavía no está disponible en este chat.",
    "pt": "Essa opção ainda não está disponível neste chat.",
}
