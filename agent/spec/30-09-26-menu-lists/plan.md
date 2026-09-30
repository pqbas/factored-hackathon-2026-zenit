# Plan: menus and fixed lists render as lists

1. `src/prompts/messages.py`: `MENU`, `CARD_OPTIONS`, `SAVINGS_OPTIONS` and `MORE_OPTIONS` in es and pt as `- **X)** …` items, one per line, with a blank line before and after the list.
2. `src/prompts/system.md`: a paragraph asking for a markdown list, one item per line, when enumerating options, products, movements or cases.
3. Tests, `tests/unit/test_messages.py`:
   - every option line of those texts starts with `- **`;
   - each list is preceded by a blank line and has one `- **` item per option (a markdown list; no parser is installed, so the structure is checked);
   - `menu_rule_intent` still maps "1"/"2" after each submenu.
