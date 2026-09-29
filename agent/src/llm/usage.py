from __future__ import annotations

from langchain_core.callbacks import UsageMetadataCallbackHandler
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration


class TurnUsage(UsageMetadataCallbackHandler):
    """Sums the tokens of every LLM call of a turn and remembers whether the LLM ran at all."""

    def __init__(self) -> None:
        super().__init__()
        self.calls = 0
        self._input = 0
        self._output = 0
        self._reported = False

    def on_chat_model_start(self, *args, **kwargs) -> None:
        self.calls += 1

    def on_llm_start(self, *args, **kwargs) -> None:
        self.calls += 1

    def on_llm_end(self, response, **kwargs) -> None:
        # The parent keys usage by response_metadata's model_name and drops it when that is
        # missing, so the sum is kept here instead.
        super().on_llm_end(response, **kwargs)
        try:
            generation = response.generations[0][0]
        except IndexError:
            return
        message = generation.message if isinstance(generation, ChatGeneration) else None
        usage = message.usage_metadata if isinstance(message, AIMessage) else None
        if usage:
            with self._lock:
                self._input += usage.get("input_tokens", 0)
                self._output += usage.get("output_tokens", 0)
                self._reported = True

    def totals(self) -> dict | None:
        """{input_tokens, output_tokens}; zeros when no LLM ran; None when it ran and reported nothing."""
        if self.calls == 0:
            return {"input_tokens": 0, "output_tokens": 0}
        if not self._reported:
            return None
        return {"input_tokens": self._input, "output_tokens": self._output}
