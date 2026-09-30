# Validation: investment opportunities, the agent's flow

- [ ] `uv run pytest -q` exits 0

## Automated

- [ ] Unit: eligibility codes, the suggestion template (es, pt), the no-advice regex, the suggestion answer, the confirmation phrase
- [ ] Integration: one suggestion per conversation, only when eligible; accepted and declined; direct request; no-advice guard
- [ ] E2E: suggestion, then accept, collect, confirm, the `investment` handoff with the contract's `verified_data`, and silence after

## Manual (local :8001, over the real view once w1:p1's block 1 is in)

- [ ] An eligible customer asking for a balance gets one suggestion with the real balance and the disclaimer. A second question gets no second suggestion.
- [ ] A not-eligible customer gets none. "Quiero invertir" enters the collection anyway.
- [ ] "¿En qué empresa invierto?" gets the no-advice text.
- [ ] The same in pt.
- [ ] Scenarios 04, 05, 06 and 10 still hand off.

Definition of Done: tests pass, the manual checks run against the real view, merged to main, no deploy.
