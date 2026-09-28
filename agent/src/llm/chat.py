from functools import lru_cache

from databricks_langchain.chat_models import ChatDatabricks

from src.config import settings


@lru_cache(maxsize=1)
def get_chat_model() -> ChatDatabricks:
    # Non-reasoning model: the LLM only does intent + slot extraction, where it matched the
    # reasoning model's accuracy on our checks at ~1s instead of ~9s per turn.
    return ChatDatabricks(endpoint=settings.llm_endpoint, temperature=0)
