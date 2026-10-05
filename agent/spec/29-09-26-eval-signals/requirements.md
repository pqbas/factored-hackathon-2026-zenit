# Requirements: turn signals for the evaluation runner

w1:p1's evaluation runner (`back/spec/29-09-26-runner-evaluacion`, requirement 15) runs the 40 cases of `docs/flujo-atencion.md` §7 against a local agent. For each turn it records cost, model, prompt version and classifier. It also needs a session whose tools fail, for case #40. This phase adds those signals to `custom_outputs`, a `fail_tools` field for the demo sessions, and a sessions file with the tokens the cases use. How David behaves doesn't change.

## 1. Functional requirements

After this phase, the agent keeps doing what it does today:

1. `custom_outputs` keeps `thread_id`, `use_case`, `intent`, `language`, `blocked`, `handoff` and `paused`, with the same meaning.
2. Without `DEMO_SESSIONS_JSON`, the default sessions are the same as today.

And it changes in these ways:

3. Every turn's `custom_outputs` carries `usage = {input_tokens, output_tokens}`: the sum over every LLM call of the turn (LLM classifier, collector extraction, respond, summarize_handoff). Jev doesn't count. A turn with no LLM call carries `{0, 0}`. A turn where no call reported usage carries `usage: null`, so the back shows "sin datos" instead of zero.
4. Every turn carries `model` (the configured `LLM_ENDPOINT`), `classifier` (`llm` or `jev`, as configured) and `prompt_version`: a 12-character hash of the prompt files (`src/prompts/*` and `configs/routing.yaml`). The hash changes only when those files change.
5. An entry of `DEMO_SESSIONS_JSON` accepts `fail_tools: ["get_products", …]` with short tool names. In that session, those UC tools raise the same error a warehouse that doesn't answer would raise, before any call is made. Sessions without `fail_tools` are unaffected.
6. `configs/eval_sessions.json` lists the tokens the cases use:
   - the 11 of the back's seed (`demo-mx-1..4`, `demo-co-1..3`, `demo-ar-1..4`);
   - `demo-mx-5` (Natalia, `CLI-MA350GCK64W1`) and `demo-co-4` (Leonardo, `CLI-2UJ5P5LESPCJ`);
   - `demo-expired`;
   - `demo-tool-down` (Santiago, with `fail_tools: ["get_products"]`).

   It is loaded with `DEMO_SESSIONS_JSON="$(cat configs/eval_sessions.json)"`, and the App never uses it.

## 2. Decisions

- Usage is collected with a LangChain callback on the graph run (`UsageMetadataCallbackHandler`), because the callbacks reach every LLM call inside the nodes without threading a counter through each one. `ChatDatabricks` reports usage in streamed calls too (`stream_usage` defaults to true).
- `prompt_version` hashes all of `src/prompts/` and `routing.yaml`, not only `system.md`, because the fixed texts and the per-intent instructions are part of what David says. It is computed once at startup.
- `fail_tools` is applied where the tools are bound to the session's customer, so the LLM path, the collector and the handoff check all see the same failure.
- The sessions file lives in the agent, next to its default sessions, so anyone can start the local agent the runner expects. The customer ids are already in the back's seed and in the dataset.
- The signals are labels and counts, never message text, the same as the rest of `custom_outputs`.
- Making David answer case #40 with the exact text is out of scope here. That belongs to the 40-case phase.

## 3. Context

- `back/spec/29-09-26-runner-evaluacion/requirements.md` §15 (the contract), `back/scripts/eval/README.md` (the tokens table).
- Code:
  - `src/main.py` (`streaming`, `non_streaming`, `turn`);
  - `src/schemas/turn_outputs.py`;
  - `src/db/session_repo.py` (`_DEFAULT_SESSIONS`, `Session`, `resolve_session`);
  - `src/graph/nodes/respond.py` (`_bound_tools`);
  - `src/tools/bind_customer.py`;
  - `src/config.py`.
