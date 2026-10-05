from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, model_validator


class GroundingKind(BaseModel):
    """A kind of account data the customer can ask for, the UC tool that returns it, the words
    of the customer's message that ask for it, and what a reply that shows it contains."""

    kind: str
    tool: str
    asks: list[str] = []
    shows: str


class IntentRoute(BaseModel):
    intent: str
    description: str
    examples: list[str]
    destination: str
    schemas: list[str] = []
    instructions: str | None = None
    # Set on a route whose operation ends with a human (docs/flujo-atencion.md, etapa 5).
    handoff_reason: str | None = None
    # Checked after the tool loop: account data in the reply needs the kind's tool to have run.
    grounding: list[GroundingKind] = []

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
