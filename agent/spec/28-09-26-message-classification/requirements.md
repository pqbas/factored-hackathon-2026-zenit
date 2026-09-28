# Requirements: Message classification

This phase adds the `classify` node from
[`docs/04`](../../docs/04-guardrails.md) between `gate` and `respond`. Jev checks
every customer message before any LLM sees it. A message that breaks a policy
gets a fixed refusal. Every other message goes on tagged with its language,
intent and sentiment, and continues to the destination that
[`routing.yaml`](../../docs/05-dispatch.md) gives its intent. The graph becomes
`gate → classify → respond`.

## 1. Functional requirements

After this phase, the agent must keep doing what it does today:

1. Reject a message with a missing, unknown or expired session in `gate`,
   without calling Jev or the LLM.
2. Answer a message that passes every check with the LLM, streamed or not, and
   remember the conversation.

And it changes in these ways:

3. Rules check each message first, with no network call: prompt injection
   phrases, and a full card number, CVV or password. If a rule matches, the
   message is blocked without calling Jev.
4. Every message that the rules let through goes to Jev in a single call. The
   call asks four questions: guardrail category, language (`es`, `pt`,
   `other`), intent (labels from `routing.yaml`) and sentiment (very negative,
   negative, neutral, positive).
5. A guardrail category other than `OK` gets a fixed refusal in the message's
   language when its probability is at or above `GUARDRAIL_THRESHOLD`. The
   refusal never reaches the LLM, and the categories are:
   - prompt injection
   - third-party data
   - abuse
   - sensitive data
   - customer risk

   Below the threshold, the message goes on and the category is recorded.
6. A message with sensitive data has the matched value masked before it is
   saved in the conversation.
7. The classification is saved in the graph state and as tags on the turn's
   MLflow trace: guardrail with probability, language, intent with
   confidence, sentiment, and source (`rules`, `jev` or `fallback`).
8. `respond` answers in the language that `classify` detected.
9. If Jev doesn't answer within `JEV_TIMEOUT_SECONDS`, returns an error, or
   isn't configured, `classify` uses the fallback rules (keywords for intent,
   accent and word hints for language). The customer still gets a response,
   and the trace records source `fallback`.
10. `routing.yaml` lists each intent with its description, its examples and a
    destination node. Adding or editing an entry changes what Jev is asked and
    where `dispatch` sends the message, with no code changes. The file is
    validated when the server starts.

## 2. Decisions

- Jev is called through `httpx` against `POST
  https://api.typesafe.ai/v1/systemone`, not through `typesafe-sdk`. `httpx`
  gives explicit control of the timeout, is easy to fake in tests with
  `httpx.MockTransport`, and is the library that
  [`docs/11`](../../docs/11-herramientas-de-implementacion.md) chose.
- The key is read from `JEV_API_KEY`, which is already in the local `.env`. In
  Databricks it will come from a secret scope; deploying is out of scope here.
- Timeout is 2 s by default, with no retries. Jev answers in 70–500 ms, and a
  retry after a timeout would delay the customer more than falling back does.
  A 429 or 529 also falls back.
- Every question uses Jev's `choice` type except sentiment, which uses
  `score`, because its levels are ordered. The guardrail probability is the
  `choice` probability of the chosen category, and the intent confidence is
  the `confidence` field of its answer.
- Rules run before Jev and a match skips the Jev call. They detect things like
  a 13–19 digit number that passes Luhn, or "ignora tus instrucciones", with
  no cost or latency, and they keep the guardrail working when Jev is down.
- The refusal is the `classify` node's own reply, followed by `END`, the same
  way `gate` rejects a session. This avoids an extra `refuse` node that
  `docs/13` doesn't have.
- For now every guardrail category gets a fixed refusal. The abuse and
  customer-risk categories should hand off to a human, but handoff arrives in
  Phase 6. Until then they reply with a fixed text, and the category stays
  recorded.
- `GUARDRAIL_THRESHOLD` defaults to 0.7. It is a starting value; Phase 8
  evaluation tunes it.
- The only destination that exists today is `respond`, so every intent in
  `routing.yaml` points to it. Destinations are validated against the graph's
  nodes, so a destination for a node that doesn't exist yet (`load_context`,
  `handoff`, `cancel`) fails at startup. Each later phase adds its node and
  changes the YAML.
- Low intent confidence doesn't change the route yet. Phase 3 adds asking the
  customer to clarify.
- `routing.yaml` holds only the fields this phase uses: `intent`,
  `description`, `examples` and `destination`. The `schemas` and
  `instructions` fields arrive with `load_context` in Phase 4.
- The message text leaves the workspace to reach Jev. The user chose the real
  Jev over a Model Serving classifier.

## 3. Context

- `spec/roadmap.md`: Phase 2, Message classification.
- `docs/04-guardrails.md`: the four questions, the categories and the
  decision order.
- `docs/05-dispatch.md`: routing tables and the `routing.yaml` format.
- `docs/11-herramientas-de-implementacion.md`: Jev with `httpx` and
  `pydantic`, and the secret scope for the key.
- TypeSafe API: https://docs.typesafe.ai/api.md
- Existing patterns:
  - `src/graph/nodes/gate.py`: a fixed reply followed by `END`.
  - `legacy/agent_server/dispute/nlu.py`: `baseline_understand`, the keyword
    regexes.
  - `legacy/agent_server/dispute/i18n.py`: `detect_language` and
    `normalize`.
