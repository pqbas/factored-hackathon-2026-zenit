# Daily traffic simulation

Runs a "day" of conversations of real bank customers (from `bank_ro`) against
the deployed back, so the console and the metrics look like real traffic.

## Run a day

```bash
# the plan, nothing sent, no sessions (needs the bank: SIM_PG_URL or the CLI)
npm run simulate:day -- --count 100 --dry-run

# for real, against a deployed App (as the CLI user, who must be an admin)
npm run simulate:day -- --count 100 --base https://<app>.databricksapps.com --allow-prod
```

Flags: `--count` (100), `--base` (http://localhost:3300), `--allow-prod`,
`--day YYYY-MM-DD` (today, UTC), `--concurrency` (3), `--no-advisor-actions`,
`--dry-run`, `--force` (run even if the cost upper bound passes 3 USD),
`--label <name>` (write `runs/<day>-<name>.json` when `runs/<day>.json`
exists: a day is never overwritten).

What it does:

1. Picks customers per motive (35 transaccional, 22 producto, 12 reclamo, 5
   estado de reclamo, 15 tecnico, 8 comercial, 3 retencion), never a demo
   customer nor one that already has a session.
2. Inserts one `sim-<uuid>` session per customer, expiring at the end of the
   day (UTC).
3. Runs the conversations (2 to 4 messages, ~20% in Portuguese; the dataset
   has no Brazil customers, so those are Mexican, Colombian and Argentine
   customers writing in Portuguese).
4. On the handoffs, as the CLI admin: ~40% taken and resolved, ~20% taken and
   returned to David, ~20% taken only, ~20% left waiting.
5. Writes `runs/<day>.json` (per conversation: customer, motive, language,
   chatId, token, handoff, advisor action, per-turn times and tokens) and
   prints the summary with the estimated cost.

Lakebase access (pick customers, write sessions) uses the CLI identity
(`DATABRICKS_CONFIG_PROFILE`). `SIM_PG_URL` points it to any other Postgres
instead, for local tests.

## Clean up a day

```bash
npm run simulate:cleanup -- --day 2026-09-30 --base <url> --allow-prod
```

Deletes the day's chats through the API (by chatId, from the run file) and its
rows in `bank_sessions.sim_sessions`. `--file runs/<x>.json` cleans one
labeled run instead (only its own sessions).

## Sessions design

`sessions.sql` creates `bank_sessions.sim_sessions` (token, customer_id,
country, expires_at, day). The back (`server/src/sim-sessions.ts`) and the
agent read a `sim-` token with one fixed query by token and check
`expires_at`; a missing row, an expired one or a database error resolves to no
customer (fails closed). Revoking a session is deleting its row. Tokens are
random, so nobody can forge another customer's session, and nothing is
redeployed per day.

## No backdating

Conversations are created with the real time of the run: there is no way to
back-date chats. `--day` only names the day of the sessions and the run file.
