"""Environment variables read in one place.

Every module that needs an env var imports ``settings`` from here instead of
calling ``os.getenv`` directly.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    llm_endpoint: str
    lakebase_instance_name: str
    checkpoint_schema: str
    demo_session_token: str | None
    demo_sessions_json: str | None

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            llm_endpoint=os.getenv("LLM_ENDPOINT", "databricks-qwen3-next-80b-a3b-instruct"),
            lakebase_instance_name=os.getenv("LAKEBASE_INSTANCE_NAME", ""),
            checkpoint_schema=os.getenv("CHECKPOINT_SCHEMA", "agent_checkpoints"),
            demo_session_token=os.getenv("DEMO_SESSION_TOKEN"),
            demo_sessions_json=os.getenv("DEMO_SESSIONS_JSON"),
        )


settings = Settings.from_env()
