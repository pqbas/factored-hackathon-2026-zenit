# Roadmap

## Phase 1: Create the project structure (Complete)

**Goal:** make the code follow the structure in `docs/13`; current behavior may change.

- [x] Folder structure defined
- [x] The current code is kept as reference in `legacy/`, outside the package
- [x] The agent starts from `src/` and answers a message end to end

Shipped en PR #1.

---

## Phase 2: Message classification (Complete)

**Goal:** every message goes through Jev before reaching any LLM.

- [x] A message that violates a policy gets a refusal and never reaches the LLM
- [x] Every message is tagged with its language, intent and sentiment
- [x] If Jev does not answer in time, the customer still gets a response
- [x] The destination of each intent changes by editing `routing.yaml`, not code

Shipped en PR #2 (merge `47a7a62`).

---

## Phase 3: Conversation without a use case (Complete)

**Goal:** the customer knows what the agent can do and how to leave.

- [x] A greeting gets an introduction with the available options
- [x] An out-of-scope question gets an explanation and the options
- [x] The customer can cancel or say goodbye at any time

Shipped en PR #4.

---

## Phase 4: UC-01 General inquiries (Complete)

**Goal:** the customer checks their balances and limits without human help.

- [x] The customer checks their credit card balance and limit
- [x] The customer checks their savings account balance
- [x] No message can make the agent show another customer's data

Shipped en PR #14.

---

## Phase 5: Stateless agent (Complete)

**Goal:** the agent answers from the history the back sends and keeps no state of its own ([`docs/limites-agente-back.md`](../../docs/limites-agente-back.md)).

- [x] The agent answers from the history in each request, capped to the last 20 messages
- [x] Sensitive data is masked in the whole history on every request
- [x] The reply language is deduced from the history, with no extra calls
- [x] The agent has no database: no checkpointer and no Lakebase

Shipped en PR #17.

---

## Phase 6: UC-02 Complaints

**Goal:** the customer files a complaint and follows its status from the chat.

- [ ] The customer files a complaint and gets a case number
- [ ] The customer checks the status of their complaints
- [ ] Unrecognized charges work inside this use case, as they do today

---

## Phase 7: Handoff to a human

**Goal:** the customer reaches an advisor without repeating their story.

- [ ] A commercial or retention request, or a request for a human that meets the policy, is detected as a handoff
- [ ] A customer who writes three words or more in a language other than Spanish or Portuguese is handed off
- [ ] Every handoff comes with a case summary in `custom_outputs.handoff`
- [ ] Every turn, streaming or not, returns `custom_outputs` with `thread_id`, `use_case`, `intent`, `language`, `blocked` and `handoff`, for the `back/` chat

The back stores the handoff, sets who handles the chat, stops calling the agent in a handed-off conversation, and serves the advisor's messages.

---

## Phase 8: Evaluation and deployment

**Goal:** show with metrics that the agent is safe and useful, running in the workspace.

- [ ] Every turn is traced and can be reviewed
- [ ] Behavior cards run as an evaluation and report the README metrics
- [ ] The agent is deployed on Databricks, without Lakebase, and the `back/` chat uses it
- [ ] `build_graph` and `get_chat_model()` are created once at startup instead of on every request (possible since Phase 5 removed the checkpointer)
- [ ] Decide how `back/` calls the agent (App URL plus `/invocations` or a serving endpoint) and how the backend App authenticates against the agent App

Advisor assignment and the advisor console API (the former Phase 7) are back work: see `back/spec/roadmap.md`.
