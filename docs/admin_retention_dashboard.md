# Admin retention dashboard

The admin-only `/retention` module prioritizes customer follow-up using observed
activity, service and satisfaction signals from Databricks Gold tables. It is
an explainable rules report, not a trained churn model or a probability that a
customer will leave the bank. Customer and advisor roles cannot access the
module or its separately protected API.

## Sources and cohort

- `workspace.bank_gold.customer_360`: reference date, current status, products,
  registration date, country and segment.
- `workspace.bank_gold.customer_transactions`: activity and inactivity.
- `workspace.bank_gold.customer_cases`: open and repeated case signals.
- `workspace.bank_gold.interaction_history`: CSAT, sentiment and unresolved
  cancellation-related interactions.

The cohort includes Active customers with at least one active product and a
registration date before the end of the snapshot reference day. The query
requires one consistent `as_of_date` across the customer snapshot. All event
windows are anchored to that date, rather than today's calendar date.

Validated on October 5 using the authorized owner CLI and the deployed backend: 150,000 supplied
customers, 114,516 eligible, with reference date **2026-06-18**. There are 446
high-priority, 10,916 medium-priority, 47,226 watch and 55,928 no-signal customers.
These counts describe rules, not confirmed exits. One eligible customer has no
transaction history; missing activity is not automatically called inactivity.

## Rule version: retention_signals_v1

| Signal | Condition | Family |
| --- | --- | --- |
| Inactive | Last transaction at least 60 days ago, tenure at least 90 days | Activity |
| Declining activity | Previous 30-day count at least 3, current count at most half, tenure at least 60 days | Activity |
| Unresolved case | At least one currently open case created by the reference date | Service |
| Repeated cases | At least two cases created in the last 90 days | Service |
| Low CSAT | At least one valid 1–5 observation, mean at most 2 in the last 90 days | Satisfaction |
| Negative sentiment | At least two observations, negative mean in the last 90 days | Satisfaction |
| Cancellation | An unresolved cancellation/closure-related interaction in the last 90 days | Cancellation |

Related signals within a family count once. High priority requires three or
more families, or an unresolved cancellation. Medium requires two families;
watch requires one; no signal requires zero. These thresholds are initial
heuristics, not validated predictors. Current case resolution/customer/product
states are snapshots and cannot reconstruct past churn outcomes. CSAT counts
are shown alongside means so a single observation is visible.

## Administrator workflow

The overview shows the eligible cohort, priority distribution, signal counts
and countries. Country and priority controls filter the bounded cached
shortlist without querying Databricks again. Expanding a reference shows the
specific reasons, inactivity days, previous/current 30-day activity, open cases
and observed CSAT with its response count. The full bank customer list is not
downloaded to the browser.

Shortlist references are 12-character hashes, not contactable identities. Up
to 15 customers per country/priority are selected deterministically by family
count, open cases and internal ID. This is a review sample, not a complete
ranking of all eligible customers or a contact campaign integration. Review
the reasons and authorized customer context before any follow-up. This module
does not send messages, close accounts or make automated customer decisions.

`GET /api/advisor/retention-dashboard` returns `{ data, source }`; `data` can be
null while preparing a report or after an unavailable/expired result. Source
metadata contains query time, tables, refresh state and statement ID. There is
no fabricated zero dashboard during a connection failure.

See [serving and cache policies](admin_analytics_serving.md) for deadlines,
failure handling, read-only boundaries and deployment limitations.

The module is deployed at
[Zenit retention](https://dmm3yembnz.us-west-2.awsapprunner.com/retention).
See the [AWS deployment report](../ml/reports/2026-10-05/aws_admin_analytics_report.md)
for live source verification, cache timings and admin-only browser checks.
