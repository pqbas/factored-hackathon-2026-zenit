import os
from functools import lru_cache

from langchain_core.language_models.chat_models import BaseChatModel

from src.config import settings


def _claude_model_class():
    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import SystemMessage

    class ClaudeChat(ChatAnthropic):
        """ChatAnthropic that takes system messages anywhere in the list, as the graph
        sends them (the language reminder goes after the history): they join the first."""

        def _get_request_payload(self, input_, *, stop=None, **kwargs):
            messages = self._convert_input(input_).to_messages()
            system = [m for m in messages if isinstance(m, SystemMessage)]
            if len(system) > 1:
                merged = SystemMessage(content="\n\n".join(str(m.content) for m in system))
                messages = [merged, *(m for m in messages if not isinstance(m, SystemMessage))]
            return super()._get_request_payload(messages, stop=stop, **kwargs)

    return ClaudeChat


def text_of(content) -> str:
    """The text of a reply: Claude sends a list of blocks (text, tool_use) where
    ChatDatabricks sent one string."""
    if isinstance(content, str):
        return content
    return "".join(
        b.get("text", "") if isinstance(b, dict) else str(b)
        for b in content
        if not isinstance(b, dict) or b.get("type") == "text"
    )


@lru_cache(maxsize=1)
def get_chat_model() -> BaseChatModel:
    if settings.llm_provider == "anthropic":
        # Claude Haiku 5.5 rejects temperature and thinks by default; thinking off at low
        # effort keeps the ~1s turns the intent + slot extraction was tuned for.
        workspace = os.getenv("ANTHROPIC_WORKSPACE_ID")
        return _claude_model_class()(
            model=settings.llm_model,
            max_tokens=2048,
            thinking={"type": "disabled"},
            model_kwargs={"output_config": {"effort": "low"}},
            default_headers={"anthropic-workspace-id": workspace} if workspace else None,
        )

    from databricks_langchain.chat_models import ChatDatabricks

    # Non-reasoning model: the LLM only does intent + slot extraction, where it matched the
    # reasoning model's accuracy on our checks at ~1s instead of ~9s per turn.
    return ChatDatabricks(endpoint=settings.llm_endpoint, temperature=0)
