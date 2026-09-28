# Requirements: Conversation without a use case

This phase gives the agent the behavior from
[`docs/05` §5.3](../../docs/05-dispatch.md) for messages that don't open a use
case: greeting, goodbye, out of scope, low confidence and cancel. The agent
presents its options, taken from `routing.yaml`, and never answers as if it
had the customer's data. Today `respond` answers every intent with the same
prompt and invents balances ("tu saldo actual es de $2,450.00 MXN"). This
phase replaces that with one instruction per situation, which the code picks,
plus a `cancel` node that needs no LLM.

## 1. Functional requirements

After this phase, the agent must keep doing what it does today:

1. Reject an invalid session in `gate` and a blocked message in `classify`,
   without calling the LLM.
2. Answer in the language that `classify` detected, and remember the
   conversation.

And it changes in these ways:

3. A greeting ("hola", "olá") gets a greeting that presents the options.
4. An out-of-scope message gets an explanation that the agent can't help with
   that, followed by the options.
5. A message whose intent confidence is below `INTENT_THRESHOLD` gets a
   request to clarify, with the options. It is not routed by its intent.
6. A goodbye gets a farewell.
7. A cancel request, at any point, gets a fixed confirmation from the `cancel`
   node, without calling the LLM.
8. An intent whose use case or handoff doesn't exist yet gets told that this
   option isn't available in the chat yet, followed by the other options. The
   intents are general inquiry, complaint, case status, human agent,
   commercial and retention.
9. The agent never states a balance, a movement, a limit, a card status or a
   case status. It has no tools yet, so it has no data to state.
10. The options come from an `option` field in `routing.yaml`, written in `es`
    and `pt`. Adding or editing an option changes what the agent offers, with
    no code change.

## 2. Decisions

- The code picks the situation and the LLM only phrases the reply.
  `situation_for(classification, threshold)` maps the classification to one
  of `greeting`, `goodbye`, `out_of_scope`, `clarify` or `unavailable`.
  `respond` then adds that situation's instruction and the options to the
  system prompt. This keeps the choice deterministic and testable, as
  `docs/05` asks, while the reply still sounds natural.
- `cancel` is a node with a fixed reply, as in `docs/05` §5.1, where `CANCEL`
  goes to `cancel` and then to the end. There is no flow to cancel yet, so
  the reply only confirms and invites the customer to continue. Phase 4
  makes `cancel` also clear `active_use_case`.
- Goodbye goes through the LLM with the `goodbye` situation, not through a
  fixed text, because `docs/05` §5.3 routes it to the agent without a use
  case. "Closing the conversation" means only the farewell; there is no
  conversation state to close yet.
- Low confidence goes to `clarify` in `dispatch`, before routing by intent.
  This is step 4 of `docs/05` §5.2; Phase 2 left it pending. Cancel is
  checked before confidence, because `docs/05` says a cancel is always
  accepted.
- `fallback_classify` sets `intent_confidence` to 1.0 when a keyword matches,
  and leaves it at 0.0 otherwise. Today it always sets 0.0, so once
  confidence is checked, every message would go to `clarify` whenever Jev is
  down, even a clear "hola".
- `INTENT_THRESHOLD` defaults to 0.5. It is a starting value; Phase 8
  evaluation tunes it.
- The options list the use cases the agent will cover (balances and limits,
  complaints, complaint status), even though Phases 4 and 5 build them. If
  the customer picks one before then, they get the `unavailable` situation.
  Listing them now makes the greeting show the agent's real scope, and each
  later phase only changes the destination in `routing.yaml`.
- The `unavailable` situation applies to any intent that reaches `respond`
  without a use case context and isn't greeting, goodbye or out of scope. It
  holds until each intent's use case (Phases 4–5) or handoff (Phase 6)
  exists. Asking for a human gets the same answer until then; the handoff
  conditions from `docs/06` §6.2 arrive in Phase 6.
- The situation instructions live in `src/prompts/situations.py`, in Spanish,
  like `system.md`. The language line added in Phase 2 still sets the reply
  language.
- The ban on stating account data goes in `system.md` and is repeated in
  every situation, because the base prompt alone did not stop the model in
  the Phase 2 manual checks.

## 3. Context

- `spec/roadmap.md`: Phase 3, Conversation without a use case.
- `docs/05-dispatch.md`: §5.1 routing tables, §5.2 decision order, §5.3 agent
  without a use case.
- `docs/06-politica-de-derivacion.md` §6.2: asking for a human (Phase 6).
- Existing patterns:
  - `src/graph/nodes/gate.py`: a fixed reply followed by `END`, which
    `cancel` follows.
  - `src/graph/nodes/respond.py`: the system prompt plus the language line.
  - `src/schemas/routing.py`: loading and validating `routing.yaml`.
  - `src/graph/edges.py`: `dispatch`.
