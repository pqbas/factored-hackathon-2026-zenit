# Requirements: David meets the 40 evaluation cases

w1:p1's baseline (`back/scripts/eval/results/2026-09-29-llm.md`: 40 cases × 3 runs, `CLASSIFIER=llm`, prompt `68747d24cacf`) passed 86 of 120 runs, with 0 unsafe. The cases are the ones in `docs/flujo-atencion.md` §7. Of the 13 failing cases, 12 are David's behavior; #36 belongs to the back (the CVV is stored unmasked). This phase fixes those 12 so they follow §7, without changing the cases or the runner.

## 1. Functional requirements

After this phase, David keeps doing what he does today:

1. The 27 cases that pass 3/3 still pass.
2. The collector, the forced handoff, the handoff check and the pause after a handoff don't change, except for what is listed below.

And he changes in these ways:

3. Movements with one product (#03, #09, #33). When the customer asks for movements and has a single product of that type, David shows its last 10 movements in the same turn and doesn't ask "¿Deseas ver los últimos 10?". He only asks which one when there are several (§7 #03).
4. Reply language (#08). When the customer's message is clearly Portuguese or clearly Spanish, the reply is in that language even if the classifier said otherwise. A message like "quanto tenho na poupança?" is recognized as Portuguese.
5. Tool down (#40). If a UC tool fails in a use-case turn, the reply is exactly "Ahora no puedo consultar esa información." (pt: "Agora não consigo consultar essa informação."), with no figures and no handoff. That also holds when the collector's own fetch fails.
6. Not available yet (#27). A question about loans, a debit card, payment date, minimum payment, total debt or transfers gets exactly "Esa consulta todavía no está disponible en este chat." (pt: "Essa consulta ainda não está disponível neste chat."), then the menu. It never gets rates, terms or conditions.
7. Out of scope (#28). A question that isn't about the customer's own balances or movements, like the exchange rate, gets the out-of-menu reply and the menu. The LLM never improvises it.
8. Ambiguous problem (#26). "Tengo un problema con mi tarjeta" without a charge isn't a complaint: David shows the menu. If the customer then picks C or describes a charge, the complaint flow starts.
9. Cancelling by product type (#17).
   - If the customer names the kind of product ("mi tarjeta", "mi cuenta") and has a single one of that kind, David takes it.
   - If there are several of that kind, he lists only those.
   - A reason already given ("porque la anualidad es muy cara") is never asked again, so the first reply is the summary with its confirmation question, and "sí, confirmo" hands off as `retention`.
10. Complaint status, continuity (#20, #21, #22).
    - When David's previous reply ends with a question about the customer's complaint (for example "¿Sobre cuál reclamo…?" or "¿Necesitas algo más sobre este reclamo?"), the next message stays in CASE_STATUS without reclassifying.
    - The exceptions are a menu letter, "menú" or a cancel, which the existing rules still catch.
    - So "el del 9 de octubre de 2025" gets that complaint's status (#20), and "necesito que me devuelvan el dinero ya" gets the case_status summary and its confirmation (#21).
11. Complaint status without complaints (#22). If get_cases returns nothing, David says so and, in the same message, asks for the charge: "¿Sobre qué cargo es tu reclamo? Dime la tarjeta, la fecha y el comercio o el monto." (pt equivalent). The flow then goes on as 3.D2 (verify the charge, what they need, confirm) and hands off as `case_status` with the charge's fields.
12. Confirmation rule (#22). A "sí" keeps the operation of the confirmation question only when the question's last line has the operation's exact phrase: "pasar tu reclamo / tu solicitud / tu consulta a un asesor" (pt: "passar sua reclamação / sua solicitação / sua consulta a um atendente"). A line that only mentions "solicitud" and "reclamo" in passing no longer hands off with the wrong reason.

## 2. Decisions

- Where the reply must be an exact text (#27, #40), code writes it instead of the prompt asking for it. In the baseline the LLM paraphrased "Ahora no puedo consultar esa información" in 2 of 3 runs.
- #27's text is taken from 3.A/3.B's rules, the one §7 expects. §3 rule 6 still lists loans as out-of-menu. Here COMMERCIAL requests and the listed unavailable queries get "todavía no está disponible" followed by the menu, which satisfies both: no handoff and the menu again.
- Continuity in CASE_STATUS (requirement 10) is a deterministic rule like the existing confirmation rule, not a classifier prompt tweak. #20 and #21 failed 3/3 because the classifier read the follow-up as a charge complaint.
  - This is the case-status piece of "don't reclassify mid-collection". The complaint and retention collector piece, and raising the timeout, wait for the user's OK (Group 6).
- The language override uses the existing marker detector (`detect_language`), extended with common Portuguese words. It only overrides when the detector is sure (pt or es, not "other").
- #26 is solved in the classifier's route descriptions: COMPLAINT requires a charge. A prompt change is enough, since the menu is the right answer and the complaint starts as soon as the customer names a charge.
- Out of scope, noted for the future: a customer who, after a status question, starts a new charge complaint without choosing C. It stays in CASE_STATUS, and the instructions there hand off with the charge, which reaches an advisor anyway.

## 3. Context

- The baseline report and its transcripts: `eval-runner/back/scripts/eval/results/2026-09-29-llm.{md,json}`.
- `docs/flujo-atencion.md` §3 (rule 6), 3.A, 3.B, 3.D1, 3.D2, etapa 4 and §7.
- Code:
  - `configs/routing.yaml` (GENERAL_INQUIRY, COMPLAINT, CASE_STATUS, COMMERCIAL, OUT_OF_SCOPE);
  - `src/llm/fallback.py` (`detect_language`, `_CONFIRMATIONS`, `menu_rule_intent`);
  - `src/graph/nodes/classify.py`;
  - `src/graph/nodes/respond.py` (`_respond_with_tools`, `_collect`, `_fetch_missing_rows`);
  - `src/tools/collector.py` (`_retention_step`);
  - `src/prompts/messages.py`, `src/prompts/situations.py`.

## 4. Annex: grounding guard per tool (#03, #09, #33)

The user rejected building the movements in code: David shouldn't become ever more deterministic. The LLM stays free to decide which tools to call and how to word the reply, and a guard checks the result before it reaches the customer. The strong movements instruction that made David invent movements in #33 (1 of 3 runs, with merchants, dates and amounts no tool returned) stays reverted. #03, #09 and #33 stay failing until the guard exists.

### Functional requirements

13. Required tool. Before the reply reaches the customer, the turn knows which tool its query needs. It comes from `routing.yaml`: each use-case route lists its data kinds, each with the words that ask for it and the tool that returns it.
    - GENERAL_INQUIRY: movements (movimientos, movimentações, compras, transacciones) need `list_transactions`; balance, limit and available credit need `get_products`.
    - CASE_STATUS: the status of a complaint needs `get_cases`.
    - The data kind is read from the customer's message. With no match, it's read from the reply: a list of movements (lines with a date and an amount) or a balance figure.
14. Check. After the tool loop, if the reply shows account data of a kind and that kind's tool wasn't called successfully in the turn, the reply is ungrounded and doesn't reach the customer.
    - Account data means figures with 3 or more digits or decimals, or dates, next to an amount.
    - Turns without account data aren't checked: questions, menus, the fixed texts.
15. What happens when the guard fires: option A, chosen by the user. One retry forcing the missing tool with `tool_choice`; if the reply still doesn't pass the check, or the tool fails, "Ahora no puedo consultar esa información." (pt: "Agora não consigo consultar essa informação.").
16. Signal. Every use-case turn carries `custom_outputs.guard`:
    - `null` when the guard didn't fire;
    - otherwise `{fired: true, missing_tool, action}`, with `action` one of `retried_ok`, `safe_reply`.

    The runner counts them. The LLM's draft text is never stored, only the labels.

### Options for requirement 15

- A (recommended). One retry, then a safe reply.
  - The turn runs the LLM once more with `tool_choice` forced to the missing tool, followed by a normal round to write the reply.
  - If the new reply passes the check, it goes out (`retried_ok`).
  - If it doesn't, or the tool fails, the reply is "Ahora no puedo consultar esa información." (`safe_reply`).
  - Cost: one or two more LLM calls, only when the guard fires.
- B. Safe reply at once: "Ahora no puedo consultar esa información." (`safe_reply`). Cheapest, but the customer loses an answer the retry would usually save.
- C. Retry without forcing the tool (a plain second attempt), then the safe reply. It depends on the LLM choosing the tool, which is exactly what failed.

### Decisions

- The guard checks what the tool log shows (which tools returned rows in the turn), not the wording. That keeps the LLM free and catches the failure seen in #33, where movements appeared without `list_transactions`.
- The data kinds and their tools live in `routing.yaml`, next to the route's instructions, so adding a kind is a config change.
- Possible later hardening, out of scope here: also check that every figure in the reply appears in the tool results of the turn. That catches a made-up amount even when the right tool was called. It is noted, not built.
- The use-case turns already don't stream deltas (silent-after-handoff), so an ungrounded reply can be stopped before the customer sees anything.

## 5. Annex: cancellation without confirmation (resolves scenario 05)

The user's decision. Cancelling a product becomes simpler than the other flows.

17. Once RETENTION is detected, the operation stays fixed. While David's previous reply is one of the cancellation's own questions (`ASK_PRODUCT`, `ASK_REASON`), the next message is RETENTION without calling the classifier. The exceptions are "cancelar"/"olvídalo" and "menú", which keep working through their rules.
18. David only collects two things:
    - the product: he takes it when the customer has one of the kind they named, and asks which one when there are several (Group 2);
    - the reason.
19. The reason is free text, taken as the customer wrote it (masked), never judged or reclassified. It is the customer's answer to "¿Por qué quieres cancelarlo?", or, when it came in the first message (#17), what the collector extracts from it.
20. As soon as David has the product and the reason, he answers "Te comunico con un asesor, que ya tiene los datos de tu caso." and hands off as `retention`, with no summary or confirmation step. `custom_outputs.handoff` has the same shape, with `product_last4` and `reason` in `verified_data`.
21. Complaint (3.C) and complaint status (3.D2) keep their confirmation.

## 6. Annex: the classifier reads the current conversation

The user's decision. The classifier decides the current intent of the conversation, not of the last message on its own.

22. The classifier (LLM or Jev) gets the current conversation: every message since the conversation opened or reopened, the customer's and David's, not earlier conversations of the same chat that were already resolved. It classifies what the customer wants now.
23. Where the current conversation starts:
    - The back sends `custom_inputs.conversation_start`: the index in `input` of the first message of the current conversation. That is the first message after the chat's last close (`closedAt` / `ResolutionEvent`), or 0 if it never closed. This part is w1:p1's.
    - Without it, the agent uses the whole history it received (at most 20 messages, as today).
24. The transcript is capped so the prompt stays bounded:
    - the last 12 messages of the current conversation;
    - David's messages cut to their last 300 characters, since menus and lists are long;
    - masked like today's context.
25. The guardrail (sensitive data, prompt injection) still judges only the customer's last message.
26. The deterministic rules stay before the classifier (menu letters, "menú", the confirmation, the complaint-status follow-up, the fixed cancellation), because they are free and exact.

### Answers to w1:p4's questions

- What the back sends today: the whole chat, every message except system notices and blocked turns (`buildAgentHistory` in `back/server/src/agent-turn.ts`), with advisor messages prefixed "[Asesor]". Earlier conversations of the same chat are included: a chat that closed and reopened keeps its old messages.
  - The agent can't tell where the current one starts. The close and reopen notices are system messages the back filters out, and the Responses input carries no timestamps.
  - The agent keeps the last 20 (`MAX_HISTORY_MESSAGES`).
  - Hence requirement 23.
- Jev takes a free-text `state` and questions with instructions. The transcript goes in as `state` ("Cliente: …\nDavid: …"), and the intent question becomes "What does the customer want now, in this conversation?". The guardrail question keeps asking about the last message.
- Measured cost, with scenario 04's conversation (7 turns, 1,934 characters of transcript), 5 calls each with the LLM classifier:
  - about +700 input tokens per classification;
  - median latency from 3.09 s to 3.36 s, about +0.3 s.
  - A turn with tools already uses 15,000 to 20,000 input tokens, so this is about +4% per turn. For Jev, the cost is its own per-call price, and the text is longer.
