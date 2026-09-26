# Databricks notebook source
# MAGIC %md
# MAGIC # Silver: typed, deduplicated tables + data quality report + quality gates
# MAGIC
# MAGIC For each table in the contract (`tables.py`):
# MAGIC 1. Cast every column to its contract type (`try_cast`: bad values become NULL and are counted).
# MAGIC 2. Normalize inconsistent spellings (`VALUE_ALIASES`, e.g. "Mexico" → "México").
# MAGIC 3. Deduplicate by primary key, keeping the latest version (`order_by` column, then latest ingestion).
# MAGIC 4. Drop rows without a primary key.
# MAGIC
# MAGIC **Quality gates.** A table with null primary keys, more than `MAX_CAST_FAILURE_PCT` unparseable values in a
# MAGIC column, a missing NOT NULL column or no rows is **not overwritten** (its last good version stays) and the job
# MAGIC fails at the end, so gold never builds on bad data. Duplicate keys are expected (resends, late corrections)
# MAGIC and resolved by keeping the latest version; above `MAX_DUPLICATE_PK_PCT` they are flagged as a warning.
# MAGIC Other findings (NOT NULL violations in non-key columns, orphan foreign keys) are reported, not blocking.
# MAGIC
# MAGIC Silver is recomputed from bronze on every run, so late-arriving files and corrected rows are always reflected
# MAGIC (idempotent). Every run appends its checks to `<prefix>_silver._dq_report`.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
dbutils.widgets.text("schema_prefix", "bank")
dbutils.widgets.dropdown("fail_on_critical", "true", ["true", "false"])
catalog = dbutils.widgets.get("catalog")
prefix = dbutils.widgets.get("schema_prefix")
fail_on_critical = dbutils.widgets.get("fail_on_critical") == "true"
BRONZE, SILVER = f"{catalog}.{prefix}_bronze", f"{catalog}.{prefix}_silver"

# COMMAND ----------

from datetime import datetime, timezone

from pyspark.sql import Window
from pyspark.sql import functions as F

from tables import FOREIGN_KEYS, MAX_CAST_FAILURE_PCT, MAX_DUPLICATE_PK_PCT, TABLES, VALUE_ALIASES

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {SILVER}")
run_at = datetime.now(timezone.utc)
dq_rows: list[tuple] = []
blocked: list[str] = []


def dq(table: str, check: str, column: str | None, failed: int, total: int, detail: str | None = None,
       severity: str = "info") -> None:
    dq_rows.append((run_at, table, check, column, int(failed), int(total), detail, severity))


def pct(part: int, whole: int) -> float:
    return 100.0 * part / whole if whole else 0.0


TRUE_VALUES = "('true', '1', 't', 'yes', 'y', 'si', 'sí')"
FALSE_VALUES = "('false', '0', 'f', 'no', 'n')"


def typed(col: str, spark_type: str):
    raw = f"nullif(trim(`{col}`), '')"
    if spark_type == "STRING":
        aliases = VALUE_ALIASES.get(col)
        if aliases:
            cases = " ".join(f"WHEN {raw} = '{k}' THEN '{v}'" for k, v in aliases.items())
            return F.expr(f"CASE {cases} ELSE {raw} END")
        return F.expr(raw)
    if spark_type == "BOOLEAN":
        return F.expr(
            f"CASE WHEN lower({raw}) IN {TRUE_VALUES} THEN true WHEN lower({raw}) IN {FALSE_VALUES} THEN false END"
        )
    if spark_type == "INT":
        return F.expr(f"try_cast(try_cast({raw} AS DECIMAL(38,6)) AS INT)")
    return F.expr(f"try_cast({raw} AS {spark_type})")


def existing_tables(schema: str) -> set[str]:
    return {r.tableName for r in spark.sql(f"SHOW TABLES IN {schema}").collect()}


# COMMAND ----------

bronze_tables = existing_tables(BRONZE)

for name, table in TABLES.items():
    if name not in bronze_tables:
        print(f"SKIP {name}: not in bronze")
        continue
    bronze = spark.table(f"{BRONZE}.{name}")
    missing = [c for c in table.column_names if c not in bronze.columns]
    for c in missing:  # tolerate schema drift in the source: missing columns become NULL
        bronze = bronze.withColumn(c, F.lit(None).cast("string"))
    extra = [c for c in bronze.columns if c not in table.column_names and not c.startswith("_")]

    df = bronze.select(
        *[typed(c.name, c.type).alias(c.name) for c in table.columns],
        *[F.col(f"`{c}`") for c in extra],
        *[F.col(c).alias(f"__raw_{c}") for c in table.column_names],
        "_source_file",
        "_ingested_at",
    )

    # ---- quality checks on the typed-but-not-deduplicated data
    aggs = [F.count(F.lit(1)).alias("total")]
    for c in table.columns:
        raw = F.col(f"__raw_{c.name}")
        aggs.append(F.sum(F.when(raw.isNotNull() & (F.trim(raw) != "") & F.col(c.name).isNull(), 1).otherwise(0)).alias(f"cast__{c.name}"))
        if c.not_null:
            aggs.append(F.sum(F.when(F.col(c.name).isNull(), 1).otherwise(0)).alias(f"null__{c.name}"))
        if c.name in VALUE_ALIASES:
            aggs.append(F.sum(F.when(F.trim(raw).isin(list(VALUE_ALIASES[c.name])), 1).otherwise(0)).alias(f"alias__{c.name}"))
    stats = df.agg(*aggs).first().asDict()
    total = stats["total"]
    problems = []
    for c in table.columns:
        casts = stats[f"cast__{c.name}"]
        if casts:
            critical = pct(casts, total) > MAX_CAST_FAILURE_PCT
            dq(name, "cast_failure", c.name, casts, total, f"not parseable as {c.type}", "critical" if critical else "warning")
            if critical:
                problems.append(f"{c.name}: {pct(casts, total):.2f}% not parseable as {c.type}")
        if c.not_null:
            nulls = stats[f"null__{c.name}"]
            dq(name, "not_null_violation", c.name, nulls, total, None, "warning" if nulls else "info")
        if c.name in VALUE_ALIASES and stats[f"alias__{c.name}"]:
            dq(name, "normalized_value", c.name, stats[f"alias__{c.name}"], total, f"aliases {VALUE_ALIASES[c.name]}")
    for c in missing:
        critical = next(x for x in table.columns if x.name == c).not_null
        dq(name, "missing_column", c, total, total, "column absent in source; filled with NULL", "critical" if critical else "warning")
        if critical:
            problems.append(f"NOT NULL column {c} missing in source")
    for c in extra:
        dq(name, "unexpected_column", c, 0, total, "column not in contract; kept as STRING", "warning")

    # ---- primary key checks (before writing, so a failing table keeps its last good version)
    pk_filter = F.lit(True)
    for k in table.pk:
        pk_filter = pk_filter & F.col(k).isNotNull()
    null_pk = df.filter(~pk_filter).count()
    distinct_pk = df.filter(pk_filter).select(*table.pk).distinct().count()
    dups = total - null_pk - distinct_pk
    dq(name, "null_primary_key", ",".join(table.pk), null_pk, total, None, "critical" if null_pk else "info")
    dq(name, "duplicate_primary_key", ",".join(table.pk), dups, total, "removed, latest version kept",
       "warning" if pct(dups, total) > MAX_DUPLICATE_PK_PCT else "info")
    if null_pk:
        problems.append(f"{null_pk} rows with null primary key")
    if total == 0:
        problems.append("no rows")

    if problems:
        blocked.append(f"{name}: " + "; ".join(problems))
        print(f"BLOCKED {name}: {problems} (previous silver version kept)")
        continue

    # ---- dedup by PK, keep latest version
    order = [F.col(table.order_by).desc_nulls_last()] if table.order_by else []
    order += [F.col("_ingested_at").desc(), F.col("_source_file").desc()]
    w = Window.partitionBy(*table.pk).orderBy(*order)
    silver = (
        df.filter(pk_filter)
        .withColumn("_rn", F.row_number().over(w))
        .filter("_rn = 1")
        .drop("_rn", *[f"__raw_{c}" for c in table.column_names])
    )
    silver.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{SILVER}.{name}")

    if "process_date" in table.column_names:
        max_pd = spark.table(f"{SILVER}.{name}").agg(F.max("process_date")).first()[0]
        dq(name, "freshness", "process_date", 0, distinct_pk, f"max process_date = {max_pd}")
    print(f"{name:28s} bronze={total:>10,d} silver={distinct_pk:>10,d} dups_removed={dups:>8,d}")

# COMMAND ----------

# ---- referential integrity (orphans exist in the real data; we report, not drop)
silver_tables = existing_tables(SILVER)
for child, ccol, parent, pcol in FOREIGN_KEYS:
    if child not in silver_tables or parent not in silver_tables:
        continue
    c = spark.table(f"{SILVER}.{child}").filter(F.col(ccol).isNotNull())
    p = spark.table(f"{SILVER}.{parent}").select(F.col(pcol).alias("__pk"))
    orphans = c.join(p, c[ccol] == p["__pk"], "left_anti").count()
    dq(child, "orphan_foreign_key", ccol, orphans, c.count(), f"-> {parent}.{pcol}", "warning" if orphans else "info")

# COMMAND ----------

report = spark.createDataFrame(
    dq_rows,
    "run_at TIMESTAMP, table_name STRING, check_name STRING, column_name STRING, failed_rows BIGINT, "
    "total_rows BIGINT, detail STRING, severity STRING",
).withColumn("failed_pct", F.round(F.col("failed_rows") / F.greatest(F.col("total_rows"), F.lit(1)) * 100, 3))
report.write.mode("append").option("mergeSchema", "true").saveAsTable(f"{SILVER}._dq_report")
display(report.filter("severity != 'info' OR check_name IN ('freshness', 'normalized_value')").orderBy("table_name", "check_name"))

if blocked and fail_on_critical:
    raise RuntimeError("Silver quality gates failed; gold was not rebuilt:\n" + "\n".join(blocked))
