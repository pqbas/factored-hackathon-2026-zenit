# Plan: Avatares con color por cliente

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/conversations.ts` | existing | Modified: 8-color palette, djb2 hash, `avatarKeyOf(chat)` |
| `src/components/conversations/inbox-list.tsx` | existing | Modified: `avatarColor(avatarKeyOf(chat))` |
| `src/components/conversations/conversation-header.tsx` | existing | Modified: same |

## Group 1: Color

1. In `src/lib/conversations.ts`:
   - `AVATAR_COLORS` becomes 8 `bg-linear-to-b` gradients: rose, orange, amber, emerald, teal, sky, indigo and violet, with no gray.
   - `avatarColor(key)` uses djb2 (`hash * 33 ^ char`, unsigned).
   - `avatarKeyOf({ customerId?, customerKey?, userId })` returns `customerId || customerKey || userId`.
2. In `inbox-list.tsx` and `conversation-header.tsx`, pass `avatarKeyOf(chat)` instead of `chat.userId`.

## Group 2: Tests

3. `tests/unit/conversations.test.ts`:
   - The same key always gives the same color, and it's in the palette.
   - `avatarKeyOf` follows the order customerId → customerKey → userId.
   - 8 different customer ids from one user get at least 4 colors.
   - No color is zinc, slate, stone, gray or neutral.
4. No new integration test: this is a pure function.
5. `back/tests/e2e/conversations.test.ts`: Daniela's row avatar and the header avatar have the same class.
