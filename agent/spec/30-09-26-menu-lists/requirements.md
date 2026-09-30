# Requirements: menus and fixed lists render as lists

The user reported that the menu reads as one run-on paragraph ("A) Tarjeta de crédito… B) Cuentas de ahorro…"). The fixed texts separate options with a single `\n`, and the front renders markdown, where a single line break doesn't end a paragraph.

## 1. Functional requirements

1. The main menu (`MENU`, which also follows the greeting, out-of-menu, not-available and person-without-topic replies) and the submenus (`CARD_OPTIONS`, `SAVINGS_OPTIONS`, `MORE_OPTIONS`) are markdown lists, one option per line, es and pt. Menu items look like `- **A)** Tarjeta de crédito: …`, and submenu items like `- **1)** Saldo…`.
2. The collector's lists and the summaries already use `- ` items and stay as they are.
3. The system prompt asks the LLM to use a markdown list, one item per line, whenever it enumerates options, products, movements or cases.
4. The menu rules keep recognizing letters, digits and the submenus: they compare against these same constants.

## 2. Decisions

- The letter or digit stays in the item, in bold, because the customer answers with it ("A", "1").
- Only the layout changes: no option text is added or removed. The back's eval patterns (`back/scripts/eval/fixed-replies.ts`) are told about the new text (w1:p1).

## 3. Context

- `src/prompts/messages.py`, `src/prompts/system.md`, `src/llm/fallback.py` (`menu_rule_intent`).
