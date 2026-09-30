from __future__ import annotations

import re

import pytest

from src.graph.nodes.classify import _SUBMENUS
from src.llm.fallback import menu_rule_intent
from src.prompts.messages import CARD_OPTIONS, MENU, MORE_OPTIONS, SAVINGS_OPTIONS

_OPTION = re.compile(r"^- \*\*([A-D1-2])\)\*\* \S")


def _list_items(text: str) -> list[str]:
    """The markdown list items of a text, checking the list starts after a blank line: with a
    single line break the front would render the options as one paragraph."""
    lines = text.split("\n")
    items = [i for i, line in enumerate(lines) if line.startswith("- ")]
    assert items, text
    assert lines[items[0] - 1] == "", "the list must start after a blank line"
    assert items == list(range(items[0], items[0] + len(items))), "one option per line, together"
    return [lines[i] for i in items]


@pytest.mark.parametrize("language", ["es", "pt"])
def test_the_menu_is_a_markdown_list_of_its_four_letters(language):
    items = _list_items(MENU[language])
    assert [_OPTION.match(item).group(1) for item in items] == ["A", "B", "C", "D"]


@pytest.mark.parametrize("texts", [CARD_OPTIONS, SAVINGS_OPTIONS, MORE_OPTIONS])
@pytest.mark.parametrize("language", ["es", "pt"])
def test_each_submenu_is_a_markdown_list_of_its_two_digits(texts, language):
    items = _list_items(texts[language])
    assert [_OPTION.match(item).group(1) for item in items] == ["1", "2"]


@pytest.mark.parametrize("language", ["es", "pt"])
def test_the_submenu_digits_still_map_after_the_list_layout(language):
    assert menu_rule_intent("1", MORE_OPTIONS[language], _SUBMENUS) == "RETENTION"
    assert menu_rule_intent("2", MORE_OPTIONS[language], _SUBMENUS) == "CASE_STATUS"
    assert menu_rule_intent("2", CARD_OPTIONS[language], _SUBMENUS) == "GENERAL_INQUIRY"
    assert menu_rule_intent("1", SAVINGS_OPTIONS[language], _SUBMENUS) == "GENERAL_INQUIRY"
