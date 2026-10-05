# Digital-event access and training-period quality

Verified on 2026-10-05 using the authorized `pqbas` CLI profile. Its effective
principal is `pcubasm1@gmail.com`. The SQL warehouse timezone is `Etc/UTC`.
Earlier `personal`-profile failures are historical evidence for a different
principal; frontend admin access does not itself establish Databricks access.
No grants or source tables were modified.

## Read-only evidence

| Check | Statement ID | Result |
| --- | --- | --- |
| Effective identity/timezone | `01f1c0d6-d73a-1be0-b142-1c031bdb7e95` | Owner identity; UTC |
| Digital table read | `01f1c0d6-de44-102b-82dd-e08d9fb58427` | SELECT succeeded |
| Digital schema | `01f1c0d6-e374-163a-a905-bea69ff4182e` | Timestamp, processing day, customer and session fields exist |
| Digital history | `01f1c0d6-e5ee-1ac2-9282-f5014f68e2a5` | Latest Delta version 4 |
| Transaction history | `01f1c0d7-05fa-1855-96dc-c802be53de1e` | Delta version 1 |
| Training-period event quality | `01f1c0d7-09c0-1bce-9c59-3d6e57ecff77` | Aggregate audit succeeded |
| Event types | `01f1c0d7-0c84-12ae-8289-5f0235aff91a` | Seven observed categories |
| Platform/channel | `01f1c0d7-0df7-17e9-b4b8-13890843b095` | Observed combinations reconciled |
| Transaction fit/selection/operating counts | `01f1c0d7-0fca-1252-a164-2f2a133a90e5` | Existing counts reconciled |

Digital profile queries use `VERSION AS OF 4` and
`event_date < TIMESTAMP '2025-07-01'`. The transaction count query excludes
transactions from July 2025 onward. No final-test labels were read.

## Findings

| Training-period event measure | Value |
| --- | ---: |
| Events | 10,529,594 |
| Identified customers | 149,792 |
| Events with null customer | 2,526,222 |
| Events exactly at midnight | 134 |
| Processing date after event calendar date | 0 |
| Processing date before event calendar date | 2,646,273 |
| Null platform | 526,793 |
| Null IP country | 0 |

Event timestamps range from 2023-06-17 06:02:03 to 2025-06-30 23:59:15.
The observed types are PageView (4,023,981), Click (2,417,269), Login (1,642,084),
Logout (1,641,545), FormSubmit (401,813), Error (241,862), and Purchase (161,040).
These categories are available to design features; no device identifier or
failed-login outcome is invented.

Null-customer events cannot be linked to an authenticated customer's history.
Sub-day precision supports a timestamp-based experiment, but the processing-date
inconsistencies prevent claiming verified production delivery semantics. The V8
experiment uses `max(event_date, midnight after process_date)` as a conservative
availability proxy; even this proxy requires later verification against real
arrival metadata before prospective use.

Event history contains optimization and vacuum operations initiated by managed
Databricks jobs. Those operations were only inspected, never initiated here.
V8 pins the current event snapshot instead of assuming old files remain readable.

Training-period transaction counts remain fit 2,271,707 / 2,296 fraud,
selection 356,361 / 344, and operating-point 366,529 / 374.

See [the V8 specification](../../spec/28-09-26-fraud-model/improvement_v8.md).
