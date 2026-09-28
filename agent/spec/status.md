# Status

## Features

- A customer with a valid session can report an unrecognized charge in the
  chat; the agent finds the transaction, applies the dispute policy and either
  creates the case or sends it to review.
- The agent replies in the customer's language and remembers the conversation
  across turns.
- A message without a valid session gets a response with no data access.
- The dispute flow has automated tests.

## Limitations

- Session tokens are hardcoded.
- The only use case is unrecognized charges; there is no Jev, MCP or handoff to
  an advisor.

## Current phase

[Phase 1: Create the project structure](roadmap.md#phase-1-create-the-project-structure-complete)
