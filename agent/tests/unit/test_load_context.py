from __future__ import annotations

from src.graph.nodes.load_context import load_context


def test_load_context_writes_the_classifications_intent_in_use_case():
    state = {"classification": {"intent": "GENERAL_INQUIRY"}}
    assert load_context(state) == {"use_case": "GENERAL_INQUIRY"}
