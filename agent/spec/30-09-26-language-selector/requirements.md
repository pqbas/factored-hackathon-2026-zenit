# Requirements: David answers in the language the customer picked

w1:p4's request: an ES | PT selector in the customer's chat, and David answers in the chosen language. The contract was agreed with w1:p6 (front) and w1:p1 (back):
- the front sends `language: 'es' | 'pt'` with each message;
- the back validates it and forwards it as `custom_inputs.language`, live and from the queue;
- when it's missing, everything behaves as today.

## 1. Functional requirements

1. The reply language is decided in this order:
   - a. the message has 3 or more words and the local detector is sure it's es or pt: the message wins. This is today's `_MIN_WORDS_TO_SWITCH` rule, so a customer who clearly writes in the other language is answered in it;
   - b. otherwise (a greeting, a menu letter or digit, a short message like "hola" or "sí"): `custom_inputs.language`, when it's `es` or `pt`;
   - c. without it: today's order, first the earlier messages of the conversation, then the session's country.
2. It applies to every fixed reply and to the LLM's replies: greeting, menu, submenus, guardrail, cancel, tool-down, not-available, handoff, collector questions and summaries.
3. The session-rejected reply (the gate, before any classification) follows `custom_inputs.language` too. Its Spanish texts don't change, and Portuguese versions are added.
4. Any other value of `custom_inputs.language` is ignored.

## 2. Decisions

- The selector ranks above the earlier messages: it is the customer's explicit, current choice, while earlier messages are only an inference.
- A clear message still beats the selector. A customer who picked PT but writes a full sentence in Spanish is answered in Spanish, as w1:p6 proposed.
- The Spanish session-rejected texts stay identical because the back's evaluation compares them exactly (`back/scripts/eval/fixed-replies.ts`).

## 3. Context

- `src/graph/nodes/classify.py` (`conversation_language`, `_MIN_WORDS_TO_SWITCH`), `src/graph/nodes/gate.py`;
- `src/prompts/messages.py` (`SESSION_REJECTED`), `src/main.py` (session and `custom_inputs`).
