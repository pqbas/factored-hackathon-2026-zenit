# Validation: Secciones con nombre real, sin "Otros"

## Automated tests

Top-level commands:

- `cd front && npx vitest run`: all green.
- `cd front && npx tsc -p tsconfig.json --noEmit`: no new errors in `src/`.
- `cd front && npm run build`: builds.
- `cd back && FRONT_URL=http://localhost:3100 PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e --project=e2e --workers=2`: all green, with :3100 free first.

Test cases that must exist:

### Unit

- `advisor.test.ts`:
  - `groupByDavidSection` returns these sections, in order:
    1. complaint;
    2. retention;
    3. case_status;
    4. general;
    5. out_of_scope (OUT_OF_SCOPE, COMMERCIAL);
    6. no_reason (GREETING, HUMAN_AGENT, null).
  - A chat with a case and a later OUT_OF_SCOPE intent stays in its case. No label is "Otros".
  - `groupByHandoffReason` puts chats without a handoff in `taken` ("Tomada por un asesor"), last.
  - `reasonTagOf` gives `out_of_scope` for an out-of-scope David chat and null for one with no reason yet.

### End-to-end

- Agente AI ends with "Fuera de alcance" and "Sin motivo aún", each with its chat.
- The Bandeja shows "Tomada por un asesor" last, with the taken chats.
- `reason-chip-NONE` and the text "Otros" don't appear in the console.

## Manual checks

Against `:3200` (read-only):

- Agente AI has no "Otros". A chat where the customer only greeted is in "Sin motivo aún". An out-of-scope question ("¿quién ganó el partido?") is in "Fuera de alcance".
- A chat taken from Agente AI shows in the Bandeja under "Tomada por un asesor".
- The row of a "Fuera de alcance" chat shows that subject with a gray dot. A "Sin motivo aún" row shows no subject.

## Definition of Done

Neither Agente AI nor the Bandeja has an "Otros" section. Every chat sits in a section that says why it's there. Unit, e2e and the manual check against :3200 pass.
