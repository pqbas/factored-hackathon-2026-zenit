# Databricks notebook source
# MAGIC %md
# MAGIC # TEST FIXTURE: update correctness of bronze → silver
# MAGIC
# MAGIC The organizer's dataset is a static snapshot with no late or corrected files, so this notebook proves the
# MAGIC incremental behaviour with a **synthetic, clearly labeled fixture** in isolated schemas
# MAGIC (`<catalog>.test_update_bronze` / `_silver`), using the real pipeline notebooks unchanged.
# MAGIC
# MAGIC | Delivery | Files | Expected in silver |
# MAGIC |---|---|---|
# MAGIC | 1 | day 1: T1 (Pending), T2 | 2 rows, T1 = Pending |
# MAGIC | 2 | day 2: T3 · **late correction** of T1 (Approved, reprocessed) · **exact duplicate** of T2 · file with a **new column** | 3 rows, T1 = Approved, duplicates removed, new column kept |
# MAGIC | 3 | nothing new | bronze unchanged (only new files are read), silver identical (idempotent) |
# MAGIC
# MAGIC The schemas are dropped at the end unless `keep=true`.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
dbutils.widgets.dropdown("keep", "false", ["false", "true"])
catalog = dbutils.widgets.get("catalog")
keep = dbutils.widgets.get("keep") == "true"
PREFIX = "test_update"
BRONZE, SILVER = f"{catalog}.{PREFIX}_bronze", f"{catalog}.{PREFIX}_silver"
LANDING = f"/Volumes/{catalog}/{PREFIX}_bronze/landing/transactions"

# COMMAND ----------

import json
import os

from tables import TABLES

for schema in (BRONZE, SILVER):
    spark.sql(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
spark.sql(f"CREATE SCHEMA {BRONZE}")
spark.sql(f"CREATE VOLUME {BRONZE}.landing")

COLS = TABLES["transactions"].column_names


def row(tid: str, day: str, status: str, amount: str = "100.00") -> dict:
    base = {c: "" for c in COLS}
    base.update(transaction_id=tid, transaction_date=f"{day} 10:00:00", process_date=day, product_id="PRD-FIXTURE",
                customer_id="CLI-FIXTURE", transaction_type="Purchase", amount=amount, currency="USD",
                amount_usd=amount, channel="POS", transaction_country="México", transaction_status=status,
                is_fraud="False")
    return base


def deliver(path: str, rows: list[dict], extra_cols: tuple[str, ...] = ()) -> None:
    cols = COLS + list(extra_cols)
    full = f"{LANDING}/{path}"
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8-sig") as f:  # BOM, like the organizer's files
        f.write(",".join(cols) + "\n")
        for r in rows:
            f.write(",".join(str(r.get(c, "")) for c in cols) + "\n")


def run_pipeline() -> None:
    args = {"catalog": catalog, "schema_prefix": PREFIX, "reset": "false", "fail_on_critical": "true"}
    # Auto Loader stops the stream once when it meets a new column (schema evolution); like the job's
    # task retries, a second attempt picks the evolved schema up.
    for attempt in range(2):
        try:
            dbutils.notebook.run("./01_bronze", 1200, args)
            break
        except Exception:
            if attempt == 1:
                raise
            print("bronze stopped for schema evolution; retrying")
    dbutils.notebook.run("./02_silver", 1200, args)


def silver() -> dict[str, dict]:
    return {r["transaction_id"]: r.asDict() for r in spark.table(f"{SILVER}.transactions").collect()}


results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str) -> None:
    results.append((name, bool(ok), detail))


# COMMAND ----------

# Delivery 1
deliver("year=2026/month=01/day=01/transactions_20260101.csv",
        [row("T1", "2026-01-01", "Pending"), row("T2", "2026-01-01", "Approved")])
run_pipeline()
s1 = silver()
check("d1: two rows", len(s1) == 2, f"{sorted(s1)}")
check("d1: T1 pending", s1["T1"]["transaction_status"] == "Pending", s1["T1"]["transaction_status"])
check("d1: BOM stripped", "transaction_id" in spark.table(f"{BRONZE}.transactions").columns, "first header readable")

# Delivery 2: new day, late correction of T1, exact duplicate of T2, new column
deliver("year=2026/month=01/day=02/transactions_20260102.csv", [row("T3", "2026-01-02", "Approved")])
deliver("year=2026/month=01/day=01/transactions_20260101_correction.csv",
        [row("T1", "2026-01-02", "Approved")])  # reprocessed later: process_date moves forward
deliver("year=2026/month=01/day=01/transactions_20260101_resend.csv", [row("T2", "2026-01-01", "Approved")])
deliver("year=2026/month=01/day=02/transactions_20260102_v2.csv",
        [{**row("T4", "2026-01-02", "Approved"), "channel_detail": "contactless"}], extra_cols=("channel_detail",))
run_pipeline()
s2 = silver()
bronze_rows_2 = spark.table(f"{BRONZE}.transactions").count()
check("d2: bronze read only new files", bronze_rows_2 == 6, f"bronze rows = {bronze_rows_2} (2 + 4 new)")
check("d2: four distinct rows", sorted(s2) == ["T1", "T2", "T3", "T4"], f"{sorted(s2)}")
check("d2: late correction wins", s2["T1"]["transaction_status"] == "Approved", s2["T1"]["transaction_status"])
check("d2: new column kept", "channel_detail" in spark.table(f"{SILVER}.transactions").columns
      and s2["T4"].get("channel_detail") == "contactless", "schema evolution")
dup = (spark.table(f"{SILVER}._dq_report").filter("table_name = 'transactions' AND check_name = 'duplicate_primary_key'")
       .orderBy("run_at", ascending=False).first())
check("d2: duplicates reported", dup["failed_rows"] == 2, f"duplicate_primary_key failed_rows = {dup['failed_rows']} (T1 old + T2 resend)")

# Delivery 3: nothing new
run_pipeline()
s3 = silver()
bronze_rows_3 = spark.table(f"{BRONZE}.transactions").count()
check("d3: no re-ingestion", bronze_rows_3 == bronze_rows_2, f"bronze rows = {bronze_rows_3}")
check("d3: idempotent silver", s3 == s2, "same rows and values")

# COMMAND ----------

report = spark.createDataFrame(results, "check STRING, passed BOOLEAN, detail STRING")
display(report)
if not keep:
    for schema in (BRONZE, SILVER):
        spark.sql(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
failed = [r for r in results if not r[1]]
assert not failed, f"Update-correctness fixture failed: {failed}"
print(f"PASS: {len(results)} checks")
dbutils.notebook.exit(json.dumps([{"check": c, "passed": p, "detail": d} for c, p, d in results]))
