# Status

## Features

- Every message goes through rules and Jev before the LLM: a policy violation
  gets a fixed refusal, and every turn is tagged with language, intent and
  sentiment in the graph state and the MLflow trace.
- If Jev does not answer in time, fallback rules classify the message and the
  customer still gets a response.
- Intents and their destinations live in `configs/routing.yaml`.
- The agent replies in the customer's language and remembers the conversation
  across turns.
- A message without a valid session gets a response with no data access.

## Limitations

- Session tokens are hardcoded.
- There are no use cases yet: every intent goes to the LLM without tools, and
  it sometimes invents account data.
- Abuse and customer risk get a fixed reply instead of a handoff to an advisor.

## Current phase

[Phase 2: Message classification](roadmap.md#phase-2-message-classification-complete)
