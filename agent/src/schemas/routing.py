from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel


class IntentRoute(BaseModel):
    intent: str
    description: str
    examples: list[str]
    destination: str


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
