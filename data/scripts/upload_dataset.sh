#!/usr/bin/env bash
# Upload a local copy of the organizer's dataset as one .tar.gz per table into the
# `bank_bronze.uploads` volume. The pipeline's first task (00_acquire, source=archive) extracts them
# into landing/<table>/. CSVs compress ~5x, and one file per table avoids thousands of slow uploads.
#
# Usage: data/scripts/upload_dataset.sh <local_dataset_dir>
#   TABLES="customers transactions" data/scripts/upload_dataset.sh <dir>   # subset
#
# Get the dataset with: aws s3 sync s3://factored-datathon-2026-s3-157725502942-us-east-2-an/data/ <local_dataset_dir>
set -euo pipefail

SRC="${1:?usage: $0 <local_dataset_dir>}"
UPLOADS="dbfs:/Volumes/${BANK_CATALOG:-workspace}/bank_bronze/uploads"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ALL_TABLES=(customers products branches service_agents marketing_campaigns daily_exchange_rates
            transactions call_center_interactions call_transcripts satisfaction_surveys
            complaints campaign_sends digital_events)
read -r -a TABLES <<< "${TABLES:-${ALL_TABLES[*]}}"

databricks volumes create "${BANK_CATALOG:-workspace}" bank_bronze uploads MANAGED >/dev/null 2>&1 || true
for t in "${TABLES[@]}"; do
  if [[ -f "$SRC/$t.csv" ]]; then member="$t.csv"
  elif [[ -d "$SRC/$t" ]]; then member="$t"
  else echo "skip $t: not found in $SRC"; continue
  fi
  tar -czf "$TMP/$t.tar.gz" -C "$SRC" "$member"
  echo "upload $t ($(du -h "$TMP/$t.tar.gz" | cut -f1))"
  databricks fs cp --overwrite "$TMP/$t.tar.gz" "$UPLOADS/$t.tar.gz" >/dev/null
  rm -f "$TMP/$t.tar.gz"
done
echo "done: run the pipeline with source=archive"
