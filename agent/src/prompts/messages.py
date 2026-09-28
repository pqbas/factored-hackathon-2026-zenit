"""Fixed replies for a rejected session.

These are templates, not LLM text: a request with no valid session never
reaches the model, so the reply has to come from somewhere fixed.
"""

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
