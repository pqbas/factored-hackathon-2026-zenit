# The back sends an advisor's turns as assistant messages that start with this prefix
# (docs/limites-agente-back.md), so the LLM can tell them apart from its own replies.
ADVISOR_PREFIX = "[Asesor]"


def strip_advisor_prefix(text: str) -> str:
    stripped = text.lstrip()
    if stripped.startswith(ADVISOR_PREFIX):
        return stripped[len(ADVISOR_PREFIX):].lstrip()
    return text


class AdvisorPrefixStreamFilter:
    """Drops ADVISOR_PREFIX from the start of a streamed reply, holding back only the first
    few characters until it's clear whether the reply starts with it."""

    def __init__(self):
        self._pending: dict[str, str] = {}
        self._decided: set[str] = set()
        # Replies whose prefix was dropped but whose text hasn't started yet: the space
        # after the prefix may arrive in a later delta.
        self._trim_start: set[str] = set()

    def feed(self, item_id: str, delta: str) -> str:
        if item_id in self._decided:
            return self._trimmed(item_id, delta)
        pending = self._pending.get(item_id, "") + delta
        head = pending.lstrip()
        if len(head) < len(ADVISOR_PREFIX) and ADVISOR_PREFIX.startswith(head):
            self._pending[item_id] = pending
            return ""
        self._pending.pop(item_id, None)
        self._decided.add(item_id)
        if head.startswith(ADVISOR_PREFIX):
            self._trim_start.add(item_id)
            return self._trimmed(item_id, head[len(ADVISOR_PREFIX):])
        return pending

    def _trimmed(self, item_id: str, delta: str) -> str:
        if item_id not in self._trim_start:
            return delta
        delta = delta.lstrip()
        if delta:
            self._trim_start.discard(item_id)
        return delta

    def flush(self) -> dict[str, str]:
        pending, self._pending = self._pending, {}
        return pending
