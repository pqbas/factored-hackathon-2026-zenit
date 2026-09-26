# Databricks notebook source
# MAGIC %md
# MAGIC # Acquire: organizer's dataset → landing volume
# MAGIC
# MAGIC Puts the organizer's dataset into `<landing>/<table>/`, the layout bronze expects. `source` picks how:
# MAGIC - `s3`: copy from `s3://<bucket>/data/` (needs outbound internet from serverless)
# MAGIC - `archive`: extract the per-table `.tar.gz` files that `data/scripts/upload_dataset.sh` put in
# MAGIC   `<prefix>_bronze.uploads` (used in Free Edition, which blocks S3)
# MAGIC - `landing`: files are already in place; do nothing
# MAGIC
# MAGIC Mapping (same for both sources):
# MAGIC - dimension tables (`customers.csv`, …) → `<landing>/customers/customers.csv`
# MAGIC - fact tables (`transactions/year=…/month=…/day=…/*.csv`) → `<landing>/transactions/year=…/…`
# MAGIC
# MAGIC Incremental: a file is copied only if it is missing in landing or its size changed, so late-arriving or
# MAGIC corrected files are picked up on the next run. Read-only credentials come from the secret scope
# MAGIC `factored-datathon` (`aws_access_key_id`, `aws_secret_access_key`), never from code.
# MAGIC
# MAGIC Needs outbound access to S3 from serverless. Databricks Free Edition blocks it ("Connection reset by peer"),
# MAGIC so there run the job with `source=landing` and upload with `data/scripts/upload_dataset.sh` instead.

# COMMAND ----------

dbutils.widgets.text("catalog", "workspace")
dbutils.widgets.text("landing_path", "/Volumes/workspace/bank_bronze/landing")
dbutils.widgets.text("s3_bucket", "factored-datathon-2026-s3-157725502942-us-east-2-an")
dbutils.widgets.text("s3_prefix", "data/")
dbutils.widgets.text("tables", "all")  # comma-separated subset, or "all"
dbutils.widgets.text("secret_scope", "factored-datathon")
dbutils.widgets.dropdown("source", "s3", ["s3", "archive", "landing"])
source = dbutils.widgets.get("source")
if source == "landing":
    dbutils.notebook.exit("source=landing: nothing to acquire")

catalog = dbutils.widgets.get("catalog")
landing = dbutils.widgets.get("landing_path").rstrip("/")
bucket = dbutils.widgets.get("s3_bucket")
prefix = dbutils.widgets.get("s3_prefix")
scope = dbutils.widgets.get("secret_scope")

# COMMAND ----------

import json
import os
from collections import Counter
from concurrent.futures import ThreadPoolExecutor


from tables import TABLES

wanted = dbutils.widgets.get("tables").strip()
selected = set(TABLES) if wanted in ("", "all") else {t.strip() for t in wanted.split(",")}
unknown = selected - set(TABLES)
assert not unknown, f"Unknown tables: {unknown}"

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.bank_bronze")
spark.sql(f"CREATE VOLUME IF NOT EXISTS {catalog}.bank_bronze.landing")
spark.sql(f"CREATE VOLUME IF NOT EXISTS {catalog}.bank_bronze.uploads")
uploads = f"/Volumes/{catalog}/bank_bronze/uploads"


def destination(rel: str) -> tuple[str, str] | None:
    """Map a dataset-relative path (customers.csv, transactions/year=.../x.csv) to (table, landing path)."""
    if not rel.endswith(".csv"):
        return None
    table = rel.split("/")[0].removesuffix(".csv")
    if table not in selected:
        return None
    return table, (f"{landing}/{table}/{rel}" if "/" not in rel else f"{landing}/{rel}")

# COMMAND ----------


# COMMAND ----------

if source == "archive":
    import shutil
    import tarfile

    copied = Counter()
    for archive in sorted(f for f in os.listdir(uploads) if f.endswith(".tar.gz")):
        with tarfile.open(f"{uploads}/{archive}", "r:gz") as tar:
            for member in tar:
                target = destination(member.name) if member.isfile() else None
                if not target:
                    continue
                table, dest = target
                if os.path.exists(dest) and os.path.getsize(dest) == member.size:
                    continue
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with tar.extractfile(member) as src, open(dest, "wb") as out:
                    shutil.copyfileobj(src, out)
                copied[table] += 1
        os.makedirs(f"{uploads}/_done", exist_ok=True)
        shutil.move(f"{uploads}/{archive}", f"{uploads}/_done/{archive}")
        print(f"extracted {archive}")
    for table in sorted(selected):
        print(f"{table:28s} {copied.get(table, 0):6d} files extracted")
    dbutils.notebook.exit(json.dumps(dict(copied)))

# COMMAND ----------

import boto3  # noqa: E402

s3 = boto3.client(
    "s3",
    region_name="us-east-2",
    aws_access_key_id=dbutils.secrets.get(scope, "aws_access_key_id"),
    aws_secret_access_key=dbutils.secrets.get(scope, "aws_secret_access_key"),
)


def plan() -> list[tuple[str, str, str, int]]:
    """(table, s3_key, landing_path, size) for every selected object that is new or changed."""
    todo = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            target = destination(obj["Key"][len(prefix):])
            if not target:
                continue
            table, dest = target
            if os.path.exists(dest) and os.path.getsize(dest) == obj["Size"]:
                continue
            todo.append((table, obj["Key"], dest, obj["Size"]))
    return todo


def copy(item: tuple[str, str, str, int]) -> str:
    table, key, dest, _ = item
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    s3.download_file(bucket, key, dest)
    return table


todo = plan()
print(f"{len(todo)} files to copy ({sum(i[3] for i in todo) / 1e9:.2f} GB)")
with ThreadPoolExecutor(max_workers=16) as pool:
    copied = Counter(pool.map(copy, todo))
for table in sorted(selected):
    print(f"{table:28s} {copied.get(table, 0):6d} files copied")
