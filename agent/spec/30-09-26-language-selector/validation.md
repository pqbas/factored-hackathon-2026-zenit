# Validation: David answers in the language the customer picked

- [x] `uv run pytest -q` exits 0
- [x] Unit: order of precedence (clear message > selector > earlier messages > country); invalid values ignored
- [x] Integration and e2e: "hola" with `language=pt` gets the Portuguese greeting and menu; session rejection in pt; without the field, today's behavior
- [ ] Manual, once w1:p1 forwards the field: local :8001 with `custom_inputs.language` es and pt, one greeting and one balance each

Definition of Done: tests pass, merged to main, no deploy.
