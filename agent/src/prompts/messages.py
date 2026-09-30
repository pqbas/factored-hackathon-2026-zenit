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
        "- **A)** Tarjeta de crédito: saldo, límite, cupo disponible y movimientos\n"
        "- **B)** Cuentas de ahorro: saldo y movimientos\n"
        "- **C)** Reclamos: un cargo que no reconoces, un cobro duplicado o un monto distinto\n"
        "- **D)** Más opciones: cancelar un producto, estado de un reclamo\n\n"
        "Escribe la letra de tu elección o cuéntame tu consulta."
    ),
    "pt": (
        "Tenho estas opções para ajudar você:\n\n"
        "- **A)** Cartão de crédito: saldo, limite, limite disponível e movimentações\n"
        "- **B)** Contas poupança: saldo e movimentações\n"
        "- **C)** Reclamações: uma cobrança que você não reconhece, uma cobrança duplicada ou um valor diferente\n"
        "- **D)** Mais opções: cancelar um produto, status de uma reclamação\n\n"
        "Escreva a letra da sua escolha ou me conte sua dúvida."
    ),
}

GREETING_REPLY: dict[str, str] = {
    "es": "¡Hola! Soy David, tu asistente virtual del banco.",
    "pt": "Olá! Sou o David, seu assistente virtual do banco.",
}

# 3.D2 with no complaints on record: said together with "No encuentro reclamos registrados."
# The question mentions the reclamo, so the answer stays in CASE_STATUS (fallback.case_status_follow_up).
ASK_CASE_CHARGE: dict[str, str] = {
    "es": "¿Sobre qué cargo es tu reclamo? Dime la tarjeta, la fecha y el comercio o el monto.",
    "pt": "Sobre qual cobrança é a sua reclamação? Me diga o cartão, a data e o comércio ou o valor.",
}

# 3.A and 3.B, step 2: what the customer wants from the product they picked by its letter.
CARD_OPTIONS: dict[str, str] = {
    "es": "¿Qué quieres ver de tu tarjeta de crédito?\n\n- **1)** Saldo, límite y cupo disponible\n- **2)** Movimientos",
    "pt": "O que você quer ver do seu cartão de crédito?\n\n- **1)** Saldo, limite e limite disponível\n- **2)** Movimentações",
}

SAVINGS_OPTIONS: dict[str, str] = {
    "es": "¿Qué quieres ver de tus cuentas de ahorro?\n\n- **1)** Saldo\n- **2)** Movimientos",
    "pt": "O que você quer ver das suas contas poupança?\n\n- **1)** Saldo\n- **2)** Movimentações",
}

MORE_OPTIONS: dict[str, str] = {
    "es": "¿Qué necesitas?\n\n- **1)** Cancelar un producto\n- **2)** Ver el estado de un reclamo",
    "pt": "Do que você precisa?\n\n- **1)** Cancelar um produto\n- **2)** Ver o status de uma reclamação",
}

# §3, regla 6: anything outside the menu gets one short line and the menu again, never a handoff.
OUT_OF_MENU: dict[str, str] = {
    "es": "No puedo ayudarte con eso por aquí.",
    "pt": "Não posso ajudar com isso por aqui.",
}

# A UC tool failed: code writes this, since the LLM paraphrased it.
TOOL_DOWN: dict[str, str] = {
    "es": "Ahora no puedo consultar esa información.",
    "pt": "Agora não consigo consultar essa informação.",
}

# Loans, debit card, payment date, minimum payment, total debt and transfers: no tool returns them.
NOT_AVAILABLE: dict[str, str] = {
    "es": "Esa consulta todavía no está disponible en este chat.",
    "pt": "Essa consulta ainda não está disponível neste chat.",
}

# A request for a person without an operation: David asks what it's about, through the menu.
HUMAN_WITHOUT_TOPIC: dict[str, str] = {
    "es": "Cuéntame qué necesitas y te ayudo.",
    "pt": "Me conte do que você precisa e eu ajudo.",
}

# docs/flujo-atencion.md, etapa 5.
HANDOFF_REPLY: dict[str, str] = {
    "es": "Te comunico con un asesor, que ya tiene los datos de tu caso.",
    "pt": "Vou transferir você para um atendente, que já tem os dados do seu caso.",
}

# docs/flujo-atencion.md, 3.C, 3.D1 and etapa 4: the questions the collector asks, in the
# order of the case's fields, and the summary it closes with. The last line of each summary
# is the confirmation question the menu rule recognises (fallback._CONFIRMATIONS).
ASK_CARD: dict[str, str] = {
    "es": "¿De qué tarjeta es el cargo?\n\n{options}",
    "pt": "De qual cartão é a cobrança?\n\n{options}",
}

ASK_CHARGE: dict[str, str] = {
    "es": "¿Cuál es el cargo? Estos son los últimos movimientos de tu tarjeta terminada en {last4}:\n\n{options}",
    "pt": "Qual é a cobrança? Estas são as últimas movimentações do seu cartão com final {last4}:\n\n{options}",
}

ASK_TYPE: dict[str, str] = {
    "es": "¿Qué pasó? No lo reconozco, me cobraron dos veces o el monto es distinto.",
    "pt": "O que aconteceu? Não reconheço, fui cobrado duas vezes ou o valor está diferente.",
}

ASK_DESCRIPTION: dict[str, str] = {
    "es": "Cuéntame brevemente lo que pasó.",
    "pt": "Me conte brevemente o que aconteceu.",
}

ASK_PRODUCT: dict[str, str] = {
    "es": "¿Qué producto quieres cancelar?\n\n{options}",
    "pt": "Qual produto você quer cancelar?\n\n{options}",
}

ASK_REASON: dict[str, str] = {
    "es": "¿Por qué quieres cancelarlo?",
    "pt": "Por que você quer cancelá-lo?",
}

# Said before asking again when what the customer gave doesn't match the bank's data.
NOT_THE_CUSTOMERS: dict[str, dict[str, str]] = {
    "card": {
        "es": "No encuentro esa tarjeta entre las tuyas.",
        "pt": "Não encontro esse cartão entre os seus.",
    },
    "product": {
        "es": "No encuentro ese producto entre los tuyos.",
        "pt": "Não encontro esse produto entre os seus.",
    },
    "charge": {
        "es": "No encuentro ese cargo en los movimientos de esa tarjeta.",
        "pt": "Não encontro essa cobrança nas movimentações desse cartão.",
    },
}

CARD_CHOICE: dict[str, str] = {
    "es": "terminada en {last4} ({currency})",
    "pt": "com final {last4} ({currency})",
}

PRODUCT_CHOICE: dict[str, str] = {
    "es": "{product_type} terminada en {last4} ({currency})",
    "pt": "{product_type} com final {last4} ({currency})",
}

COMPLAINT_TYPE_LABEL: dict[str, dict[str, str]] = {
    "not_recognized": {"es": "no lo reconozco", "pt": "não reconheço"},
    "duplicate_charge": {"es": "me cobraron dos veces", "pt": "fui cobrado duas vezes"},
    "different_amount": {"es": "el monto es distinto", "pt": "o valor está diferente"},
}

COMPLAINT_SUMMARY: dict[str, str] = {
    "es": (
        "Estos son los datos de tu reclamo:\n\n"
        "- Tarjeta: terminada en {card_last4}\n"
        "- Cargo: {charge}\n"
        "- Qué pasó: {complaint_type}\n"
        "- Descripción: {description}\n\n"
        "¿Confirmas estos datos para pasar tu reclamo a un asesor?"
    ),
    "pt": (
        "Estes são os dados da sua reclamação:\n\n"
        "- Cartão: com final {card_last4}\n"
        "- Cobrança: {charge}\n"
        "- O que aconteceu: {complaint_type}\n"
        "- Descrição: {description}\n\n"
        "Você confirma estes dados para passar sua reclamação a um atendente?"
    ),
}

RETENTION_SUMMARY: dict[str, str] = {
    "es": (
        "Estos son los datos de tu solicitud:\n\n"
        "- Producto: {product}\n"
        "- Motivo: {reason}\n\n"
        "¿Confirmas estos datos para pasar tu solicitud a un asesor?"
    ),
    "pt": (
        "Estes são os dados da sua solicitação:\n\n"
        "- Produto: {product}\n"
        "- Motivo: {reason}\n\n"
        "Você confirma estes dados para passar sua solicitação a um atendente?"
    ),
}
