# Bank Data Platform – Engineering Reference

A working reference covering core concepts (marketing campaigns, dimensional modeling, late arrivals, schema evolution) and a review of the challenges to tackle in the 14-table banking dataset.

---

## Part 1 – Concepts

### 1.1 Marketing campaigns

A **marketing campaign** is a planned, time-bound effort to get a specific group of customers (or prospects) to take a specific action: open a credit card, take a loan, activate mobile banking, raise a card limit, or stay with the bank instead of leaving.

Every campaign has the same building blocks:

| Element | Example |
|---|---|
| Objective | Sell 5,000 pre-approved loans this quarter |
| Target segment | Customers aged 25–45, good payment history, no active loan |
| Offer | Preferential rate, waived fees |
| Channels | SMS, email, push, call center, branch, in-app banner |
| Time window | Start and end dates |
| Measurement | Contacts, responses, conversions, revenue, lift vs. a control group |

**Data engineering responsibilities** usually include customer attributes for segmentation, feature tables for propensity models, target lists, contact history (who, when, channel, campaign ID), response and conversion tracking, and **suppression lists** (opted-out customers, no marketing consent, collections, deceased). Suppression logic is heavily audited in banking.

#### Relationship with customer complaints

- **Complaints filter campaigns.** Customers with open or recent complaints are commonly excluded from sales campaigns. Complaint data must therefore be timely.
- **Campaigns cause complaints.** Contacting opted-out customers, over-contacting, misleading offers, and mis-selling all generate complaints. Complaint rate is a campaign KPI, measured by linking complaints back to campaign sends (customer + date window + campaign ID).
- **Complaints drive campaigns.** Complaints are a strong churn signal, feeding retention and service-recovery campaigns.

### 1.2 Dimension vs. fact tables

**Dimension tables** describe the *who, what, where, when*: customers, products, branches, agents, campaigns, dates. They are wide, relatively small, change slowly, and are used to **filter and group**.

**Fact tables** record *events or measurements*: transactions, calls, surveys, complaints, campaign sends. They are narrow, very large, mostly foreign keys plus numeric measures, and are used to **sum and count**.

A fact table surrounded by dimensions forms a **star schema**.

### 1.3 Late arrivals

A **late arrival** is a record that belongs to a partition already processed but arrives afterwards (e.g., a transaction dated Sept 20 received on Sept 25 due to system delays, retries, or offline sync).

Two flavors:

- **Late-arriving facts:** the event arrives after its date partition was loaded. Risk: silently incomplete totals.
- **Late-arriving dimensions** (early-arriving facts): a fact references a customer or product not yet in the dimension. Risk: inner joins drop the fact.

How to handle:

1. Store both `event_date` and `ingestion_ts`; partition by **event date**.
2. Reprocess a **lookback window** (e.g., last 7 days) each run using idempotent writes (`MERGE` or partition overwrite).
3. Map unresolved dimension keys to an **Unknown member** (key `-1`) or insert a stub row; log orphans and re-resolve on later runs.
4. **Measure lateness** to size the lookback window.

### 1.4 Schema evolution

**Schema evolution** is when a source table's structure changes over time: new columns, dropped or renamed columns, changed data types. Unmanaged, it breaks pipelines or silently loads wrong data.

How to handle:

1. **Detect** schema differences before loading and alert on any change.
2. **Classify by risk:** new nullable columns are usually safe to auto-accept; renames, drops, and type changes should stop the load or quarantine data.
3. Use formats that support evolution: **Delta Lake, Apache Iceberg, Apache Hudi** (e.g., Delta `mergeSchema`).
4. Use a **schema registry / data contracts** with source teams where possible.
5. **Avoid `SELECT *`** in transformations; select columns explicitly.
6. Keep a **raw (bronze) layer** that stores data as-is, so data can be reprocessed after fixing a transformation.

---

## Part 2 – Dataset Review

### 2.1 Inventory

| Type | Table | Rows |
|---|---|---:|
| Dimension | customers | 150,000 |
| Dimension | products | 400,000 |
| Dimension | branches | 350 |
| Dimension | service_agents | 1,200 |
| Dimension | marketing_campaigns | 200 |
| Fact | transactions | 5,000,000 |
| Fact | call_center_interactions | 800,000 |
| Fact | call_transcripts | 200,000 |
| Fact | satisfaction_surveys | 250,000 |
| Fact | digital_events | 10,000,000 |
| Fact | complaints | 80,000 |
| Fact | campaign_sends | 2,000,000 |
| Reference | daily_exchange_rates | 3,000 |
| *Proposed* | *dim_date* | *~1 row/day* |

**Total: ~18.9 million rows** (not 13M). This is small; a single Spark cluster, DuckDB, or Postgres can handle it. Favor simplicity.

Known data quality challenges: ~2% duplicates, ~5% nulls in non-mandatory fields, late arrivals, schema evolution. Large facts are partitioned by year/month/day.

### 2.2 Modeling observations

- **`products` is customer holdings, not a catalog.** It has `customer_id` and `opening_branch_id`, so each row is an account/card/loan. Status changes over time → needs history. Confirm whether **closed products are retained**; if only active ones are kept, old transactions and complaints will become orphans.
- **Fact-to-fact dependencies.** `call_transcripts`, `satisfaction_surveys`, and `complaints` reference `call_center_interactions.interaction_id`. This creates load-order dependencies and extra late-arrival risk (surveys and transcripts naturally arrive after the call).
- **`complaints` is an accumulating snapshot.** A complaint moves through opened → assigned → escalated → resolved. Many "duplicates" are successive versions; keep the latest version. PQR (*Peticiones, Quejas y Reclamos*) may mix requests, complaints, and claims; separate them for reporting.
- **No date dimension.** Add `dim_date` (year, month, quarter, weekday, holiday flag).
- **No campaign response table.** Derive conversion: a send followed by a matching product opening (`products`) or relevant `digital_events` within an attribution window (e.g., 30 days). Apply the same logic to attribute complaints to campaigns.

### 2.3 Load order

Derived from the foreign key relationships:

1. `branches`, `marketing_campaigns`, `daily_exchange_rates`, `dim_date`
2. `customers`, `service_agents` (depend on branches)
3. `products` (depends on customers, branches)
4. `call_center_interactions`, `transactions`, `digital_events`, `campaign_sends`
5. `call_transcripts`, `satisfaction_surveys`, `complaints` (depend on interactions)

### 2.4 Challenge playbook

#### Duplicates (~2%)

Define a business key per table and deduplicate in the cleaned (silver) layer, keeping the latest version:

```sql
SELECT *
FROM (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY transaction_id
           ORDER BY ingestion_ts DESC
         ) AS rn
  FROM bronze.transactions
) t
WHERE rn = 1;
```

- Obvious keys: `customer_id`, `interaction_id`, `complaint_id`, `transaction_id`.
- `digital_events`: check for a real event ID; otherwise hash the defining columns (customer, event type, timestamp, product).
- Log duplicates removed per run and alert on spikes.

#### Nulls (~5%)

| Column role | Treatment |
|---|---|
| Null foreign key in a fact | Map to Unknown member (`-1`) so joins keep the row |
| Null descriptive attribute in a dimension | Readable default ("Not informed") if used for filtering |
| Null measure (amount, CSAT score) | Leave null; never replace with 0 |

Some nulls are legitimate: `complaints.origin_interaction_id` is null for complaints not filed via a call.

#### Late arrivals

- Partition by event date; keep `ingestion_ts` on every row.
- Reprocess a lookback window (start with 7 days, tune by measured lateness) with `MERGE` or partition overwrite.
- Late-arriving dimensions: Unknown key + orphan log + re-resolve on later runs.
- **Exchange rates:** no rates on weekends/holidays, and rates may arrive after transactions. Fall back to the last available rate, store original amount + currency + converted amount, and flag fallback conversions.
- **Partition granularity:** at ~7,000 transactions/day, daily partitions risk the small-files problem. Consider monthly partitions, or daily partitions with regular compaction/clustering (Delta/Iceberg).

#### Schema evolution

- Land raw data as-is in bronze; conform in silver/gold.
- Compare incoming vs. expected schema each run.
- Auto-accept new nullable columns; block renames, drops, and type changes.
- Use Delta Lake or Iceberg to add columns without rewriting history.

#### History in dimensions (SCD Type 2)

Overwriting attributes rewrites history (e.g., last year's complaints reported under today's customer segments). Use **SCD Type 2**: one row per version with `valid_from`, `valid_to`, `is_current`, and join facts to the version valid at the event date.

| Table | Strategy |
|---|---|
| customers | SCD Type 2 |
| products | SCD Type 2 |
| service_agents | SCD Type 2 |
| branches | Overwrite (Type 1) |
| marketing_campaigns | Overwrite (Type 1) |

### 2.5 Data quality tests

The foreign key list is a ready-made test suite. After each load, track:

- **Orphan counts** for every foreign key relationship
- **Duplicate rate** per table
- **Null rate** per column
- **Row counts** per partition (to spot missing or late data)

Tools: dbt tests, Great Expectations, or scheduled SQL.

### 2.6 Sensitive data

`customers` contains personal data; `call_transcripts` contains free text that may include account numbers, IDs, or health details. Agree early with security/compliance on masking, access roles, and retention.

---

## Part 3 – Foreign Key Reference

| Child column | Parent |
|---|---|
| products.customer_id | customers.customer_id |
| transactions.customer_id | customers.customer_id |
| call_center_interactions.customer_id | customers.customer_id |
| call_transcripts.customer_id | customers.customer_id |
| satisfaction_surveys.customer_id | customers.customer_id |
| digital_events.customer_id | customers.customer_id |
| complaints.customer_id | customers.customer_id |
| campaign_sends.customer_id | customers.customer_id |
| customers.registration_branch_id | branches.branch_id |
| products.opening_branch_id | branches.branch_id |
| service_agents.assigned_branch_id | branches.branch_id |
| transactions.branch_id | branches.branch_id |
| complaints.related_branch_id | branches.branch_id |
| call_center_interactions.agent_id | service_agents.agent_id |
| call_transcripts.agent_id | service_agents.agent_id |
| satisfaction_surveys.agent_id | service_agents.agent_id |
| complaints.assigned_agent_id | service_agents.agent_id |
| transactions.product_id | products.product_id |
| digital_events.product_id | products.product_id |
| complaints.affected_product_id | products.product_id |
| campaign_sends.campaign_id | marketing_campaigns.campaign_id |
| call_transcripts.interaction_id | call_center_interactions.interaction_id |
| satisfaction_surveys.interaction_id | call_center_interactions.interaction_id |
| complaints.origin_interaction_id | call_center_interactions.interaction_id |