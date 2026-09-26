# Databricks notebook source
# MAGIC %md
# MAGIC # Silver: typed, deduplicated tables + data quality report
# MAGIC
# MAGIC For each table in the contract (`tables.py`):
# MAGIC 1. Cast every column to its contract type (`try_cast`: bad values become NULL and are counted, never fail the job).
# MAGIC 2. Deduplicate by primary key, keeping the latest version (`order_by` column, then latest ingestion).
# MAGIC 3. Drop rows without a primary key.
# MAGIC
# MAGIC Silver is recomputed from bronze on every run, so late-arriving files and corrected rows are always reflected
# MAGIC (idempotent). Every run appends its quality checks to `bank_silver._dq_report`.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
catalog = dbutils.widgets.get("catalog")

# COMMAND ----------

from datetime import datetime, timezone

from pyspark.sql import Window
from pyspark.sql import functions as F

from tables import FOREIGN_KEYS, TABLES

run_at = datetime.now(timezone.utc)
dq_rows: list[tuple] = []


def dq(table: str, check: str, column: str | None, failed: int, total: int, detail: str | None = None) -> None:
    dq_rows.append((run_at, table, check, column, int(failed), int(total), detail))


TRUE_VALUES = "('true', '1', 't', 'yes', 'y', 'si', 'sí')"
FALSE_VALUES = "('false', '0', 'f', 'no', 'n')"


def typed(col: str, spark_type: str):
    raw = f"nullif(trim(`{col}`), '')"
    if spark_type == "STRING":
        return F.expr(raw)
    if spark_type == "BOOLEAN":
        return F.expr(
            f"CASE WHEN lower({raw}) IN {TRUE_VALUES} THEN true WHEN lower({raw}) IN {FALSE_VALUES} THEN false END"
        )
    if spark_type == "INT":
        return F.expr(f"try_cast(try_cast({raw} AS DECIMAL(38,6)) AS INT)")
    return F.expr(f"try_cast({raw} AS {spark_type})")


def existing_tables(schema: str) -> set[str]:
    return {r.tableName for r in spark.sql(f"SHOW TABLES IN {catalog}.{schema}").collect()}


# COMMAND ----------

bronze_tables = existing_tables("bank_bronze")

for name, table in TABLES.items():
    if name not in bronze_tables:
        print(f"SKIP {name}: not in bronze")
        continue
    bronze = spark.table(f"{catalog}.bank_bronze.{name}")
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
        aggs.append(F.sum(F.when(F.col(f"__raw_{c.name}").isNotNull() & (F.trim(F.col(f"__raw_{c.name}")) != "") & F.col(c.name).isNull(), 1).otherwise(0)).alias(f"cast__{c.name}"))
        if c.not_null:
            aggs.append(F.sum(F.when(F.col(c.name).isNull(), 1).otherwise(0)).alias(f"null__{c.name}"))
    stats = df.agg(*aggs).first().asDict()
    total = stats["total"]
    for c in table.columns:
        if stats[f"cast__{c.name}"]:
            dq(name, "cast_failure", c.name, stats[f"cast__{c.name}"], total, f"not parseable as {c.type}")
        if c.not_null:
            dq(name, "not_null_violation", c.name, stats[f"null__{c.name}"], total)
    for c in missing:
        dq(name, "missing_column", c, total, total, "column absent in source; filled with NULL")
    for c in extra:
        dq(name, "unexpected_column", c, 0, total, "column not in contract; kept as STRING")

    # ---- dedup by PK, keep latest version
    order = [F.col(table.order_by).desc_nulls_last()] if table.order_by else []
    order += [F.col("_ingested_at").desc(), F.col("_source_file").desc()]
    pk_filter = F.lit(True)
    for k in table.pk:
        pk_filter = pk_filter & F.col(k).isNotNull()
    null_pk = df.filter(~pk_filter).count()
    w = Window.partitionBy(*table.pk).orderBy(*order)
    silver = (
        df.filter(pk_filter)
        .withColumn("_rn", F.row_number().over(w))
        .filter("_rn = 1")
        .drop("_rn", *[f"__raw_{c}" for c in table.column_names])
    )
    silver.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(f"{catalog}.bank_silver.{name}")

    kept = spark.table(f"{catalog}.bank_silver.{name}").count()
    dq(name, "null_primary_key", ",".join(table.pk), null_pk, total)
    dq(name, "duplicate_primary_key", ",".join(table.pk), total - null_pk - kept, total, "removed, latest version kept")
    if "process_date" in table.column_names:
        max_pd = spark.table(f"{catalog}.bank_silver.{name}").agg(F.max("process_date")).first()[0]
        dq(name, "freshness", "process_date", 0, kept, f"max process_date = {max_pd}")
    print(f"{name:28s} bronze={total:>10,d} silver={kept:>10,d} dups_removed={total - null_pk - kept:>8,d}")

# COMMAND ----------

# ---- referential integrity (orphans are expected in the real data; we report, not drop)
silver_tables = existing_tables("bank_silver")
for child, ccol, parent, pcol in FOREIGN_KEYS:
    if child not in silver_tables or parent not in silver_tables:
        continue
    c = spark.table(f"{catalog}.bank_silver.{child}").filter(F.col(ccol).isNotNull())
    p = spark.table(f"{catalog}.bank_silver.{parent}").select(F.col(pcol).alias("__pk"))
    orphans = c.join(p, c[ccol] == p["__pk"], "left_anti").count()
    dq(child, "orphan_foreign_key", ccol, orphans, c.count(), f"-> {parent}.{pcol}")

# COMMAND ----------

report = spark.createDataFrame(
    dq_rows,
    "run_at TIMESTAMP, table_name STRING, check_name STRING, column_name STRING, failed_rows BIGINT, total_rows BIGINT, detail STRING",
).withColumn("failed_pct", F.round(F.col("failed_rows") / F.greatest(F.col("total_rows"), F.lit(1)) * 100, 3))
report.write.mode("append").option("mergeSchema", "true").saveAsTable(f"{catalog}.bank_silver._dq_report")
display(report.filter("failed_rows > 0 OR check_name = 'freshness'").orderBy("table_name", "check_name"))
