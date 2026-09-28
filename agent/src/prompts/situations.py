SITUATIONS: dict[str, str] = {
    "greeting": (
        "El cliente te saluda. Salúdalo con cordialidad y presenta las opciones a "
        "continuación, esperando a que elija una."
    ),
    "goodbye": "El cliente se despide. Despídete con cordialidad y cierra la conversación.",
    "out_of_scope": (
        "El mensaje del cliente no corresponde a nada que puedas resolver en este chat. "
        "Explícale con amabilidad que no puedes ayudarlo con eso y presenta las opciones "
        "a continuación."
    ),
    "clarify": (
        "No estás seguro de qué necesita el cliente. Pídele que aclare su solicitud y "
        "presenta las opciones a continuación."
    ),
    "unavailable": (
        "El cliente pide algo que todavía no está disponible en este chat. Tu primera "
        "oración debe decir que esa opción todavía no está disponible en este chat; no "
        "digas que no tienes acceso. No digas que lo vas a conectar o transferir con un "
        "asesor, no lo mandes a otro canal y no respondas lo que pidió. Luego presenta "
        "las opciones a continuación."
    ),
}

_SITUATION_BY_INTENT = {
    "GREETING": "greeting",
    "GOODBYE": "goodbye",
    "OUT_OF_SCOPE": "out_of_scope",
}


def situation_for(classification: dict, intent_threshold: float) -> str:
    if classification.get("intent_confidence", 0.0) < intent_threshold:
        return "clarify"
    return _SITUATION_BY_INTENT.get(classification.get("intent"), "unavailable")
