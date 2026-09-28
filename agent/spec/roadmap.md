# Roadmap

## Phase 1: Create the project structure (Complete)

**Goal:** make the code follow the structure in `docs/13`; current behavior may change.

- [x] Folder structure defined
- [x] The current code is kept as reference in `legacy/`, outside the package
- [x] The agent starts from `src/` and answers a message end to end

Shipped en PR #1.

---

## Phase 2: Message classification

**Goal:** every message goes through Jev before reaching any LLM.

- [ ] A message that violates a policy gets a refusal and never reaches the LLM
- [ ] Every message is tagged with its language, intent and sentiment
- [ ] If Jev does not answer in time, the customer still gets a response
- [ ] The destination of each intent changes by editing `routing.yaml`, not code

---

## Phase 3: Conversation without a use case

**Goal:** the customer knows what the agent can do and how to leave.

- [ ] A greeting gets an introduction with the available options
- [ ] An out-of-scope question gets an explanation and the options
- [ ] The customer can cancel or say goodbye at any time

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
- [ ] Every handoff is recorded with a case summary
- [ ] The agent stops responding in a handed-off conversation

---

## Phase 7: Advisor assignment

**Goal:** every handoff reaches the right advisor.

- [ ] Every handoff is assigned to an available advisor by specialty and language
- [ ] The advisor sees their assigned cases with the summary and the conversation
- [ ] Two simultaneous handoffs never take the same advisor

---

## Phase 8: Evaluation and deployment

**Goal:** show with metrics that the agent is safe and useful, running in the workspace.

- [ ] Every turn is traced and can be reviewed
- [ ] Behavior cards run as an evaluation and report the README metrics
- [ ] The agent is deployed on Databricks and the `back/` chat uses it
