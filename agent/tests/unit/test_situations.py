from __future__ import annotations

import pytest

from src.prompts.messages import GREETING_REPLY, MENU, MORE_OPTIONS, OUT_OF_MENU
from src.prompts.situations import fixed_reply, situation_for

THRESHOLD = 0.5


def _classification(**overrides) -> dict:
    base = {"intent": "GREETING", "intent_confidence": 0.9}
    return {**base, **overrides}


def test_low_confidence_gets_the_menu_even_for_a_greeting():
    classification = _classification(intent="GREETING", intent_confidence=0.2)
    assert situation_for(classification, THRESHOLD) == "out_of_menu"


@pytest.mark.parametrize(
    "intent, situation",
    [
        ("GREETING", "greeting"),
        ("GOODBYE", "goodbye"),
        ("MENU", "menu"),
        ("MORE_OPTIONS", "more_options"),
        ("CARD_OPTIONS", "card_options"),
        ("SAVINGS_OPTIONS", "savings_options"),
        ("OUT_OF_SCOPE", "out_of_menu"),
        ("COMMERCIAL", "not_available"),
        ("HUMAN_AGENT", "human_without_topic"),
    ],
)
def test_situation_for_maps_the_intent_to_its_situation(intent, situation):
    assert situation_for(_classification(intent=intent), THRESHOLD) == situation


@pytest.mark.parametrize("situation", ["greeting", "out_of_menu", "human_without_topic", "menu"])
@pytest.mark.parametrize("language", ["es", "pt"])
def test_every_fixed_reply_but_more_options_ends_with_the_menu(situation, language):
    assert fixed_reply(situation, language).endswith(MENU[language])


def test_greeting_is_the_fixed_presentation_then_the_menu():
    assert fixed_reply("greeting", "pt") == GREETING_REPLY["pt"] + "\n\n" + MENU["pt"]


def test_out_of_menu_falls_back_to_spanish_for_other():
    assert fixed_reply("out_of_menu", "other").startswith(OUT_OF_MENU["es"])


def test_more_options_is_the_d_submenu():
    assert fixed_reply("more_options", "es") == MORE_OPTIONS["es"]


def test_goodbye_has_no_fixed_reply():
    assert fixed_reply("goodbye", "es") is None
