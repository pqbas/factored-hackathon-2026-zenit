import os
from functools import lru_cache

from langchain_core.language_models.chat_models import BaseChatModel

from src.config import settings


@lru_cache(maxsize=1)
def get_chat_model() -> BaseChatModel:
    if settings.llm_provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        # Claude Haiku 5.5 rejects temperature and thinks by default; thinking off at low
        # effort keeps the ~1s turns the intent + slot extraction was tuned for.
        workspace = os.getenv("ANTHROPIC_WORKSPACE_ID")
        return ChatAnthropic(
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
