# Historical dimension timing audit

Read-only owner-profile queries on 2026-10-05 inspected customer/product schemas,
their latest Delta history, and pre-July-2025 transaction aggregates. Both
dimensions are at Delta v1. The aggregate join query used transaction v1 and
the dimensions' current snapshots; separately inspected histories identify the
dimension versions but do not turn those snapshots into historical revisions.

Statement `01f1c0ef-91cf-1650-83f5-1f5252617d6e` returned:

| Pre-July-2025 measure | Transactions |
| --- | ---: |
| Total | 2,994,597 |
| Missing customer join | 0 |
| Missing product/owner join | 0 |
| Customer registration later than transaction | 744,640 |
| Product opening day later than transaction | 741,683 |
| Birth date later than transaction | 0 |

The first two joins demonstrate relational coverage, not temporal correctness.
Approximately one quarter of these transactions precede the recorded customer
registration or product opening. No date was corrected or inferred into the
source database. Current balances, limits, customer credit scores and product
statuses cannot be treated as known historical fields without actual revisions.

Statement `01f1c0ef-94f1-1793-a4d2-8e9959879929` grouped product type, origination
channel and age decade separately in fit, selection and operating periods.
Large groups remained near the roughly 0.1% fraud prevalence. Examples:

| Group | Fit rows / fraud | Selection rows / fraud | Operating rows / fraud |
| --- | ---: | ---: | ---: |
| Credit card | 568,648 / 593 | 89,784 / 96 | 92,196 / 101 |
| Savings account | 682,775 / 668 | 106,579 / 86 | 109,930 / 116 |
| Branch origination | 1,136,610 / 1,143 | 178,324 / 161 | 183,694 / 192 |
| App origination | 452,427 / 466 | 70,946 / 59 | 72,585 / 64 |

These are descriptive training-period aggregates, not an exhaustive interaction
test, a significance test, or proof of random labels. They do not justify
claiming that snapshot joins will fix precision. V9 therefore focuses on the
new digital-history coverage hypothesis and does not add these snapshot fields.

## Required provenance for a defensible next iteration

The following questions can be sent to the dataset producer by the user:

1. How was `is_fraud` assigned? Which events or rules make a positive label?
2. When does a transaction's fraud label become confirmed or final?
3. How was `fraud_score` generated? Does it depend on `is_fraud`, and when was it available?
4. What do digital `event_date` and `process_date` mean when processing precedes the event?
5. Are customer registration/product opening dates intentionally inconsistent,
   and is there an authoritative correction or historical dimension table?

No message was sent to organizers, source tables were not modified, and no
2026 final-test transactions or labels were accessed by these queries.
