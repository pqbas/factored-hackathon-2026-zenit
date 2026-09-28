from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, field_validator


class IntentRoute(BaseModel):
    intent: str
    description: str
    examples: list[str]
    destination: str
    option: dict[str, str] | None = None

    @field_validator("option")
    @classmethod
    def _option_has_es_and_pt(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is not None and not {"es", "pt"} <= value.keys():
            raise ValueError("option must include both 'es' and 'pt'")
        return value


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


def render_options(routes: list[IntentRoute], language: str) -> str:
    lang = language if language in ("es", "pt") else "es"
    options = [route.option[lang] for route in routes if route.option]
    return "\n".join(f"{i}. {option}" for i, option in enumerate(options, start=1))
