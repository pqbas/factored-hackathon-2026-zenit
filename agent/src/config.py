from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    llm_endpoint: str
    demo_sessions_json: str | None
    classifier: str
    classifier_timeout_seconds: float
    jev_api_key: str | None
    jev_url: str
    jev_timeout_seconds: float
    guardrail_threshold: float
    intent_threshold: float
    routing_path: str
    uc_catalog: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            llm_endpoint=os.getenv("LLM_ENDPOINT", "databricks-qwen3-next-80b-a3b-instruct"),
            demo_sessions_json=os.getenv("DEMO_SESSIONS_JSON"),
            # jev (default) or llm: the App can't reach Jev, so it classifies with the LLM.
            classifier=os.getenv("CLASSIFIER", "jev"),
            classifier_timeout_seconds=float(os.getenv("CLASSIFIER_TIMEOUT_SECONDS", "4.0")),
            jev_api_key=os.getenv("JEV_API_KEY"),
            jev_url=os.getenv("JEV_URL", "https://api.typesafe.ai/v1/systemone"),
            jev_timeout_seconds=float(os.getenv("JEV_TIMEOUT_SECONDS", "2.0")),
            guardrail_threshold=float(os.getenv("GUARDRAIL_THRESHOLD", "0.7")),
            intent_threshold=float(os.getenv("INTENT_THRESHOLD", "0.5")),
            routing_path=os.getenv("ROUTING_PATH", "configs/routing.yaml"),
            uc_catalog=os.getenv("UC_CATALOG", "workspace"),
        )


settings = Settings.from_env()
