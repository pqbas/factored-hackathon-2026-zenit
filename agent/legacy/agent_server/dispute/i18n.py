"""User-facing messages in Spanish and Portuguese.

Replies are templates, not free LLM text: anything the customer reads about
their money or a case comes from verified data and fixed wording, so the model
cannot claim an action that did not happen.
"""

from __future__ import annotations

import re
import unicodedata

MESSAGES: dict[str, dict[str, str]] = {
    "auth_missing": {
        "es": "Para ayudarte con tus movimientos necesito que inicies sesión en la banca digital. Por seguridad no puedo identificarte solo con un número de documento o de cliente.",
        "pt": "Para ajudar com suas transações, preciso que você faça login no banco digital. Por segurança, não posso identificar você apenas com um número de documento ou de cliente.",
    },
    "auth_expired": {
        "es": "Tu sesión expiró. Vuelve a iniciar sesión y retomamos tu solicitud.",
        "pt": "Sua sessão expirou. Faça login novamente e retomamos sua solicitação.",
    },
    "greeting": {
        "es": "Hola{name}. Puedo ayudarte a reportar un cargo que no reconoces en tu cuenta o tarjeta. Cuéntame qué cobro ves (comercio, monto o fecha).",
        "pt": "Olá{name}. Posso ajudar você a contestar uma cobrança que não reconhece na sua conta ou cartão. Conte qual cobrança você vê (estabelecimento, valor ou data).",
    },
    "out_of_scope": {
        "es": "Por ahora solo puedo ayudarte a reportar cargos no reconocidos. Para otras consultas puedo derivarte con un asesor: escribe \"asesor\".",
        "pt": "No momento só posso ajudar a contestar cobranças não reconhecidas. Para outros assuntos posso transferir você para um atendente: escreva \"atendente\".",
    },
    "ask_details": {
        "es": "Para encontrar el cargo, dime al menos uno de estos datos: el comercio, el monto o la fecha aproximada.",
        "pt": "Para encontrar a cobrança, me diga pelo menos um destes dados: o estabelecimento, o valor ou a data aproximada.",
    },
    "no_match": {
        "es": "No encontré un cargo con esos datos en tus movimientos{window}. ¿Puedes darme otro dato, como el monto exacto o la fecha?",
        "pt": "Não encontrei uma cobrança com esses dados nas suas transações{window}. Pode me passar outro dado, como o valor exato ou a data?",
    },
    "select": {
        "es": "Encontré varios cargos que coinciden. ¿Cuál quieres reportar? Responde con el número:\n\n{options}\n\nSi no es ninguno, escribe \"ninguno\".",
        "pt": "Encontrei várias cobranças parecidas. Qual você quer contestar? Responda com o número:\n\n{options}\n\nSe não for nenhuma, escreva \"nenhuma\".",
    },
    "too_many": {
        "es": "Encontré {count} cargos posibles. Estos son los más recientes:\n\n{options}\n\nResponde con el número, o dame el monto o la fecha para afinar la búsqueda.",
        "pt": "Encontrei {count} cobranças possíveis. Estas são as mais recentes:\n\n{options}\n\nResponda com o número, ou me passe o valor ou a data para refinar a busca.",
    },
    "confirm": {
        "es": "Encontré este cargo:\n\n{tx}\n\n¿Es el que no reconoces? Responde sí o no.",
        "pt": "Encontrei esta cobrança:\n\n{tx}\n\nÉ esta que você não reconhece? Responda sim ou não.",
    },
    "confirm_again": {
        "es": "No entendí tu respuesta. ¿El cargo {tx_short} es el que no reconoces? Responde sí o no.",
        "pt": "Não entendi sua resposta. A cobrança {tx_short} é a que você não reconhece? Responda sim ou não.",
    },
    "rejected_candidate": {
        "es": "Entendido, no es ese. Dame otro dato del cargo (comercio, monto o fecha) y lo busco de nuevo.",
        "pt": "Entendido, não é essa. Me passe outro dado da cobrança (estabelecimento, valor ou data) e busco de novo.",
    },
    "case_created": {
        "es": "Listo. Registré tu reclamo por el cargo {tx_short} con el número de caso **{case_id}**. Un equipo lo revisará y te responderá en un plazo de hasta 15 días hábiles. Este registro no bloquea tu tarjeta ni genera un abono automático; si crees que tu tarjeta está comprometida, escribe \"asesor\".",
        "pt": "Pronto. Registrei sua contestação da cobrança {tx_short} com o número de caso **{case_id}**. Uma equipe vai analisar e responder em até 15 dias úteis. Este registro não bloqueia seu cartão nem gera estorno automático; se acha que seu cartão foi comprometido, escreva \"atendente\".",
    },
    "escalated": {
        "es": "Registré tu reclamo por el cargo {tx_short} con el número de caso **{case_id}** y lo derivé a un asesor, porque {why}. Ya tiene toda la información que me diste, así que no tendrás que repetirla.",
        "pt": "Registrei sua contestação da cobrança {tx_short} com o número de caso **{case_id}** e encaminhei para um atendente, porque {why}. Ele já tem todas as informações que você me passou, então não precisará repetir.",
    },
    "handoff": {
        "es": "Te derivo con un asesor{case}. Le paso el resumen de lo que conversamos para que no tengas que repetirlo.",
        "pt": "Vou transferir você para um atendente{case}. Envio o resumo da nossa conversa para você não precisar repetir.",
    },
    "handoff_unsaved": {
        "es": "Quise derivarte con un asesor, pero no pude registrar el caso por un problema técnico. Por favor comunícate a la línea de atención; no se registró ningún reclamo todavía.",
        "pt": "Tentei transferir você para um atendente, mas não consegui registrar o caso por um problema técnico. Por favor, ligue para a central de atendimento; nenhuma contestação foi registrada ainda.",
    },
    "not_eligible": {
        "es": "Revisé el cargo {tx_short}: {why} Por eso no puedo registrar un reclamo por este movimiento. Si quieres, escribe \"asesor\" para hablar con una persona.",
        "pt": "Verifiquei a cobrança {tx_short}: {why} Por isso não posso registrar uma contestação para esta transação. Se quiser, escreva \"atendente\" para falar com uma pessoa.",
    },
    "tool_error": {
        "es": "No pude consultar tus movimientos en este momento. No se registró ningún reclamo. Intenta de nuevo en unos minutos o escribe \"asesor\".",
        "pt": "Não consegui consultar suas transações agora. Nenhuma contestação foi registrada. Tente novamente em alguns minutos ou escreva \"atendente\".",
    },
    "cancelled": {
        "es": "Cancelé la solicitud. No se registró ningún reclamo.",
        "pt": "Cancelei a solicitação. Nenhuma contestação foi registrada.",
    },
}

WHY: dict[str, dict[str, str]] = {
    "NE_ALREADY_DISPUTED": {"es": "ya tiene un reclamo abierto.", "pt": "já tem uma contestação aberta."},
    "NE_NOT_A_DEBIT": {"es": "es un abono o ajuste, no un cargo.", "pt": "é um crédito ou ajuste, não uma cobrança."},
    "NE_DECLINED": {"es": "fue rechazado, así que no se te cobró.", "pt": "foi recusada, então você não foi cobrado."},
    "NE_PENDING": {"es": "todavía está pendiente; podrás reclamarlo cuando se procese.", "pt": "ainda está pendente; você poderá contestar quando for processada."},
    "NE_REVERSED": {"es": "ya fue revertido.", "pt": "já foi estornada."},
    "NE_TOO_OLD": {"es": "tiene más de 120 días, fuera del plazo de reclamo.", "pt": "tem mais de 120 dias, fora do prazo de contestação."},
    "ESC_AMOUNT": {"es": "el monto requiere revisión de una persona", "pt": "o valor exige análise de uma pessoa"},
    "ESC_NO_USD": {"es": "el monto requiere revisión de una persona", "pt": "o valor exige análise de uma pessoa"},
    "ESC_FRAUD_SIGNAL": {"es": "el movimiento tiene señales de posible fraude", "pt": "a transação tem sinais de possível fraude"},
    "ESC_OPEN_CASES": {"es": "ya tienes otros casos abiertos", "pt": "você já tem outros casos abertos"},
    "ESC_CUSTOMER_STATUS": {"es": "tu cuenta requiere revisión de una persona", "pt": "sua conta exige análise de uma pessoa"},
}

STATUS: dict[str, dict[str, str]] = {
    "Approved": {"es": "aprobado", "pt": "aprovada"},
    "Declined": {"es": "rechazado", "pt": "recusada"},
    "Pending": {"es": "pendiente", "pt": "pendente"},
    "Reversed": {"es": "revertido", "pt": "estornada"},
}


def msg(key: str, lang: str, **kwargs) -> str:
    lang = lang if lang in ("es", "pt") else "es"
    return MESSAGES[key][lang].format(**kwargs)


def why(rules: list[str], lang: str) -> str:
    lang = lang if lang in ("es", "pt") else "es"
    parts = [WHY[r][lang] for r in rules if r in WHY]
    sep = " y " if lang == "es" else " e "
    return sep.join(p.rstrip(".") for p in parts) if len(parts) > 1 else (parts[0] if parts else "")


def format_tx(tx: dict, lang: str) -> str:
    merchant = tx.get("merchant_name") or tx.get("transaction_type")
    status = STATUS.get(tx["transaction_status"], {}).get(lang, tx["transaction_status"])
    product = f" · {tx['product_type']}" if tx.get("product_type") else ""
    return f"{tx['transaction_date'][:16]} · {merchant} · {tx['amount']:,.2f} {tx['currency']} · {status}{product}"


def format_tx_short(tx: dict) -> str:
    merchant = tx.get("merchant_name") or tx.get("transaction_type")
    return f"{merchant} de {tx['amount']:,.2f} {tx['currency']} ({tx['transaction_date'][:10]})"


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


_PT_MARKERS = re.compile(
    r"\b(nao|voce|obrigad[oa]|cobranca|reconheco|estorno|compra que nao|minha|meu|cartao|ontem|hoje|atendente|sim|oi|ola|valor|nenhum[a]?)\b"
)
_ES_MARKERS = re.compile(
    r"\b(no reconozco|yo|mi|tarjeta|cargo|cobro|ayer|hoy|asesor|si|hola|monto|ninguno|gracias|quiero|compra que no)\b"
)


def detect_language(text: str) -> str | None:
    """Keyword baseline for es/pt. Returns None when there is no signal."""
    t = normalize(text)
    pt, es = len(_PT_MARKERS.findall(t)), len(_ES_MARKERS.findall(t))
    if pt > es:
        return "pt"
    if es > pt:
        return "es"
    return None
