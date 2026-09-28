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

## Phase 4: UC-01 General inquiries

**Goal:** the customer checks their balances and limits without human help.

- [ ] The customer checks their credit card balance and limit
- [ ] The customer checks their savings account balance
- [ ] No message can make the agent show another customer's data

---

## Phase 5: UC-02 Complaints

**Goal:** the customer files a complaint and follows its status from the chat.

- [ ] The customer files a complaint and gets a case number
- [ ] The customer checks the status of their complaints
- [ ] Unrecognized charges work inside this use case, as they do today

---

## Phase 6: Handoff to a human

**Goal:** the customer reaches an advisor without repeating their story.

- [ ] A commercial or retention request, or a request for a human that meets the policy, is handed off
- [ ] A customer who writes three words or more in a language other than Spanish or Portuguese is handed off
- [ ] Every handoff is recorded with a case summary
- [ ] The agent stops responding in a handed-off conversation: the stream ends with no text and with `custom_outputs.handled_by`
- [ ] Every turn, streaming or not, returns `custom_outputs` with `thread_id`, `handled_by`, `use_case`, `intent`, `language` and `handoff_id`, for the `back/` chat
- [ ] `GET /conversations/{id}/messages` returns the advisor's messages, only for the session's `customer_id`

---

## Phase 7: Advisor assignment

**Goal:** every handoff reaches the right advisor.

- [ ] Every handoff is assigned to an available advisor by specialty and language
- [ ] The advisor sees their assigned cases with the summary and the conversation
- [ ] Two simultaneous handoffs never take the same advisor
- [ ] The advisor console routes (`GET /handoffs`, `GET /handoffs/{id}`, `POST /handoffs/{id}/claim`, `/messages`, `/close`) run in the agent App, with the response contract shared with `back/` before implementing

---

## Phase 8: Evaluation and deployment

**Goal:** show with metrics that the agent is safe and useful, running in the workspace.

- [ ] Every turn is traced and can be reviewed
- [ ] Behavior cards run as an evaluation and report the README metrics
- [ ] The agent is deployed on Databricks and the `back/` chat uses it
- [ ] Decide how `back/` calls the agent (App URL plus `/invocations` or a serving endpoint) and how the backend App authenticates against the agent App
