from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, model_validator


class IntentRoute(BaseModel):
    intent: str
    description: str
    examples: list[str]
    destination: str
    schemas: list[str] = []
    instructions: str | None = None

    @model_validator(mode="after")
    def _load_context_needs_schemas_and_instructions(self) -> "IntentRoute":
        if self.destination == "load_context" and (not self.schemas or not self.instructions):
            raise ValueError("a load_context route needs both 'schemas' and 'instructions'")
        return self


def load_routing(path: str | Path, allowed_destinations: set[str]) -> list[IntentRoute]:
    raw = yaml.safe_load(Path(path).read_text())
    if not raw:
        raise ValueError(f"{path}: routing file is empty")

    routes: list[IntentRoute] = []
    seen: set[str] = set()
    for entry in raw:
        route = IntentRoute.model_validate(entry)
        if route.intent in seen:
            raise ValueError(f"{path}: duplicate intent {route.intent!r}")
        seen.add(route.intent)
        if route.destination not in allowed_destinations:
            raise ValueError(
                f"{path}: intent {route.intent!r} has unknown destination {route.destination!r}"
            )
        routes.append(route)
    return routes
