# Databricks notebook source
# MAGIC %md
# MAGIC # Bronze: raw ingestion
# MAGIC
# MAGIC Incrementally ingests the CSV files in `<landing>/<table>/` into `<catalog>.bank_bronze.<table>` with Auto Loader.
# MAGIC Every column lands as STRING (typing happens in silver) plus lineage columns `_source_file` and `_ingested_at`.
# MAGIC Unknown columns (schema evolution) are added automatically; unparseable values go to `_rescued_data`.
# MAGIC
# MAGIC Works the same for the dummy data (`data/generate_dummy_data.py`) and for the real Factored dataset.
# MAGIC Set `reset=true` to drop bronze tables and checkpoints before ingesting (e.g. when swapping dummy for real data).

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
dbutils.widgets.text("landing_path", "/Volumes/workspace/bank_bronze/landing")
dbutils.widgets.dropdown("reset", "false", ["false", "true"])

catalog = dbutils.widgets.get("catalog")
landing = dbutils.widgets.get("landing_path").rstrip("/")
reset = dbutils.widgets.get("reset") == "true"
checkpoints = f"/Volumes/{catalog}/bank_bronze/checkpoints"

# COMMAND ----------

from pyspark.sql import functions as F

from tables import TABLES

for schema in ("bank_bronze", "bank_silver", "bank_gold"):
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"CREATE VOLUME IF NOT EXISTS {catalog}.bank_bronze.landing")
spark.sql(f"CREATE VOLUME IF NOT EXISTS {catalog}.bank_bronze.checkpoints")

if reset:
    for name in TABLES:
        spark.sql(f"DROP TABLE IF EXISTS {catalog}.bank_bronze.{name}")
        dbutils.fs.rm(f"{checkpoints}/{name}", recurse=True)
    print("Bronze reset: tables and checkpoints removed")

# COMMAND ----------


def ingest(name: str) -> None:
    source = f"{landing}/{name}"
    reader = (
        spark.readStream.format("cloudFiles")
        .option("cloudFiles.format", "csv")
        .option("cloudFiles.schemaLocation", f"{checkpoints}/{name}/schema")
        .option("cloudFiles.inferColumnTypes", "false")
        .option("cloudFiles.schemaEvolutionMode", "addNewColumns")
        .option("header", "true")
        .option("multiLine", "true")
        .option("escape", '"')
        .option("encoding", "UTF-8")
        .load(source)
        .withColumn("_source_file", F.col("_metadata.file_path"))
        .withColumn("_ingested_at", F.current_timestamp())
    )
    (
        reader.writeStream.option("checkpointLocation", f"{checkpoints}/{name}/stream")
        .option("mergeSchema", "true")
        .trigger(availableNow=True)
        .toTable(f"{catalog}.bank_bronze.{name}")
        .awaitTermination()
    )


def has_files(path: str) -> bool:
    try:
        return len(dbutils.fs.ls(path)) > 0
    except Exception:
        return False


for name in TABLES:
    if not has_files(f"{landing}/{name}"):
        print(f"SKIP {name}: no files in {landing}/{name}")
        continue
    # Auto Loader stops the stream once when it detects new columns; the retry picks them up.
    for attempt in range(2):
        try:
            ingest(name)
            break
        except Exception as e:
            if attempt == 1 or "UNKNOWN_FIELD_EXCEPTION" not in str(e):
                raise
            print(f"{name}: schema evolved, retrying")
    rows = spark.table(f"{catalog}.bank_bronze.{name}").count()
    print(f"{name:28s} {rows:>12,d} rows in bronze")
