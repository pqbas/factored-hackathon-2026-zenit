# Validation: Estado de un reclamo (bloque c)

This block can merge when all of the following pass, locally and in the App.

## Automated Tests

- [ ] `uv run pytest -q` exits 0 with no failures

### Specific test coverage required

#### Unit

- [ ] `verify_case("case_status", {complaint_id, need}, {get_cases})` returns the bank's date, subcategory, amount, status and resolution plus `need`
- [ ] An unknown `complaint_id` returns an error that names it
- [ ] A case not in `get_cases` is verified by its card and charge
- [ ] A case-status handoff without the complaint or the charge asks for it
- [ ] `menu_rule_intent("sí", <previous reply ending in the confirmation question>)` returns COMPLAINT, RETENTION or CASE_STATUS, in es and pt, exact or paraphrased ("¿…pasar esta consulta a un asesor?")
- [ ] `menu_rule_intent("sí", "¿Quieres ver tus movimientos?")` returns None
- [ ] The CASE_STATUS route loads as `load_context` with `handoff_reason` `case_status`

#### Integration

- [ ] A CASE_STATUS turn whose LLM calls `get_cases` and then `hand_off_to_advisor` with a `complaint_id` ends with `handoff.reason` `case_status`, `facts.case_id` and the bank's status
- [ ] A "sí" after the CASE_STATUS confirmation question is classified CASE_STATUS without calling the classifier

#### End-to-end

- [ ] POST `/invocations` with a CASE_STATUS confirmation turn and faked `get_cases` returns "Te comunico con un asesor, que ya tiene los datos de tu caso." and `custom_outputs.handoff` with reason `case_status` and `facts.case_id`

## Manual Checks

- [ ] `SELECT * FROM workspace.bank_uc_consultas.get_cases('CLI-0IY07CEBUL79')` returns 3 complaints (In Process, Closed, Open)
- [ ] `SHOW GRANTS ON SCHEMA workspace.bank_uc_consultas` lists EXECUTE for the App's service principal
- [ ] Locally, `demo-mx-2` with "D", "2" → lists the three complaints with their real status
- [ ] Locally, "el de octubre" → "Tu reclamo … está abierto y en revisión." plus the question about needing something more
- [ ] Locally, "quiero saber cuándo lo van a resolver" → a summary ending in "¿Confirmas estos datos para pasar tu consulta a un asesor?", with no invented timeline
- [ ] Locally, "sí" → "Te comunico con un asesor…" and `handoff.facts.case_id` = `CMP-G43865HGA80E110M7EWK`; the same with `CLASSIFIER=jev` and `llm`
- [ ] A cancellation whose reason mentions a fee ("porque me cobran una comisión muy alta") stays RETENTION and hands off after "sí, confirmo"
- [ ] `npm run simulate -- --all` from `back/` against local, with `CLASSIFIER=jev` and `llm`: 04, 05, 06 and 10 end "En espera"; 01-03 "Resuelta"; the rest as before

## Post-deploy Checks

- [ ] After `apply_uc.py`, re-run `grant_app.sql`; the App's log shows `tools […get_cases, get_products, list_transactions]` on a handoff check and never "No MCP tools listed"
- [ ] In the App: balance of `demo-mx-1` still answers with figures
- [ ] In the App: the 3.D2 flow of `demo-mx-2` hands off with `case_status` and the stream carries only the fixed reply, not the summary

## Rollback Criteria

Redeploy the previous `main` if the App stops answering balances or lists no MCP tools after the deploy.

## Definition of Done

All boxes checked, the WIP commits squashed into commits that follow the plan groups, `demo-mx-2` added to the back's demo customers by w1:p1, and the PR merged into `main` and deployed.
