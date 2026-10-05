#!/usr/bin/env python3
"""Phase 0 read-only profiling against workspace.bank_silver.transactions.

Queries are executed through the Databricks SQL Statements API (CLI subprocess).
All counts are aggregate-only; no individual customer records are downloaded.

Dependencies: Python stdlib + databricks CLI v1.18+.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# ──────────────────────────────────────────────
# configuration
# ──────────────────────────────────────────────

API_BASE = "/api/2.0/sql"
STATEMENTS_PATH = f"{API_BASE}/statements"
SOURCE_TABLE = "workspace.bank_silver.transactions"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "reports"


# ──────────────────────────────────────────────
# CLI helpers
# ──────────────────────────────────────────────


def _databricks_cli(args: List[str], profile: str) -> subprocess.CompletedProcess:
    cmd = ["databricks", "-p", profile] + args
    return subprocess.run(cmd, capture_output=True, text=True, timeout=300)


def _post_statement(
    sql: str,
    warehouse_id: str,
    profile: str,
    *,
    timeout_s: int = 30,
    row_limit: int = 100000,
) -> Dict[str, Any]:
    body = {
        "statement": sql,
        "warehouse_id": warehouse_id,
        "wait_timeout": f"{timeout_s}s",
        "on_wait_timeout": "CONTINUE",
        "row_limit": row_limit,
    }
    proc = _databricks_cli(
        ["api", "post", STATEMENTS_PATH, "--json", json.dumps(body)],
        profile=profile,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"POST statement failed: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


def _get_statement_result(statement_id: str, profile: str) -> Dict[str, Any]:
    path = f"{STATEMENTS_PATH}/{statement_id}"
    proc = _databricks_cli(["api", "get", path], profile=profile)
    if proc.returncode != 0:
        raise RuntimeError(
            f"GET statement {statement_id} failed: {proc.stderr.strip()}"
        )
    return json.loads(proc.stdout)


def _get_result_chunk(
    statement_id: str, chunk_index: int, profile: str
) -> Dict[str, Any]:
    path = f"{STATEMENTS_PATH}/{statement_id}/result/chunks/{chunk_index}"
    proc = _databricks_cli(["api", "get", path], profile=profile)
    if proc.returncode != 0:
        raise RuntimeError(
            f"GET chunk {chunk_index} for {statement_id} failed: {proc.stderr.strip()}"
        )
    return json.loads(proc.stdout)


# ──────────────────────────────────────────────
# statement executor
# ──────────────────────────────────────────────


def _execute_and_fetch(
    sql: str,
    warehouse_id: str,
    profile: str,
    *,
    timeout_s: int = 60,
    poll_interval_s: float = 2.0,
    max_poll_s: float = 180.0,
    row_limit: int = 100000,
) -> Dict[str, Any]:
    """Post a statement, poll if pending, and collect all result chunks.

    Returns a dict with keys:
      statement_id, external_links (list of dicts with link_id and data_array),
      schema, total_row_count, truncated (bool), state, execution_ms.
    """
    t0 = time.monotonic()
    payload = _post_statement(sql, warehouse_id, profile, timeout_s=timeout_s, row_limit=row_limit)

    statement_id = payload["statement_id"]
    external_links: List[Dict[str, Any]] = []
    schema = payload["manifest"]["schema"]
    total_row_count = payload["manifest"]["total_row_count"]
    truncated = payload["manifest"]["truncated"]

    external_links: List[Dict[str, Any]] = []
    total_row_count: int = 0
    truncated: bool = False

    elapsed = time.monotonic() - t0
    result = payload.get("result")
    if result is not None:
        external_links.append(
            {"link_id": f"chunk_{result['chunk_index']}", "data_array": result["data_array"]}
        )

    polled_state = payload["status"]["state"]
    poll_duration_ms = elapsed * 1000
    total_row_count = payload["manifest"].get("total_row_count", 0)
    truncated = payload["manifest"].get("truncated", False)

    # poll for pending states
    while polled_state in ("PENDING", "RUNNING") and elapsed < max_poll_s:
        time.sleep(poll_interval_s)
        elapsed = time.monotonic() - t0
        status_payload = _get_statement_result(statement_id, profile)
        poll_duration_ms = elapsed * 1000

        total_row_count = status_payload["manifest"].get("total_row_count", total_row_count)
        truncated = status_payload["manifest"].get("truncated", False) or truncated

        chunk_result = status_payload.get("result")
        if chunk_result is not None:
            chunk_key = f"chunk_{chunk_result['chunk_index']}"
            if not any(l["link_id"] == chunk_key for l in external_links):
                external_links.append(
                    {"link_id": chunk_key, "data_array": chunk_result["data_array"]}
                )

        polled_state = status_payload["status"]["state"]

    if polled_state != "SUCCEEDED":
        status_payload = _get_statement_result(statement_id, profile)
        raise RuntimeError(
            f"Statement {statement_id} ended with state {polled_state}: "
            f"{json.dumps(status_payload['status'], default=str)}"
        )

    if not external_links and total_row_count > 0:
        status_payload = _get_statement_result(statement_id, profile)
        total_row_count = status_payload["manifest"].get("total_row_count", total_row_count)
        chunk_result = status_payload.get("result")
        if chunk_result is not None:
            external_links.append(
                {"link_id": f"chunk_{chunk_result['chunk_index']}", "data_array": chunk_result["data_array"]}
            )

    return {
        "statement_id": statement_id,
        "external_links": external_links,
        "schema": payload["manifest"]["schema"],
        "total_row_count": total_row_count,
        "truncated": truncated,
        "state": polled_state,
        "execution_ms": poll_duration_ms,
    }


# ──────────────────────────────────────────────
# dry-run mode
# ──────────────────────────────────────────────


class DryRunExecutor:
    """Records planned queries without connecting remotely."""

    def __init__(self) -> None:
        self.queries: List[Dict[str, str]] = []

    def record(self, label: str, sql: str) -> None:
        self.queries.append({"label": label, "sql": sql.strip()})


# ──────────────────────────────────────────────
# queries
# ──────────────────────────────────────────────


def _version_query(table: str) -> str:
    return f"DESCRIBE HISTORY {table}"


def _profiling_queries(
    table: str, version: int, source_row_estimate: int
) -> List[Dict[str, str]]:
    """Return the ordered list of read-only aggregate profiling queries.

    Each entry: {"label": "...", "sql": "..."}

    All data queries pin the Delta version with VERSION AS OF.
    """
    source = f"{table} VERSION AS OF {version}"
    return [
        {
            "label": "row_counts",
            "sql": f"""
                SELECT
                    COUNT(*)               AS total_rows,
                    COUNT(DISTINCT transaction_id) AS distinct_ids,
                    SUM(CASE WHEN transaction_id IS NULL THEN 1 ELSE 0 END) AS null_ids
                FROM {source}
            """,
        },
        {
            "label": "key_duplicates",
            "sql": f"""
                SELECT
                    COUNT(*)           AS total_rows_after_dedup,
                    COUNT(transaction_id) - COUNT(DISTINCT transaction_id) AS duplicate_count
                FROM (SELECT transaction_id FROM {source}) t
            """,
        },
        {
            "label": "label_distribution",
            "sql": f"""
                SELECT
                    COUNT(*) AS total_rows,
                    SUM(CASE WHEN is_fraud IS NULL THEN 1 ELSE 0 END)   AS null_labels,
                    SUM(CASE WHEN is_fraud = TRUE  THEN 1 ELSE 0 END)   AS positives,
                    SUM(CASE WHEN is_fraud = FALSE THEN 1 ELSE 0 END)   AS negatives
                FROM {source}
            """,
        },
        {
            "label": "date_range",
            "sql": f"""
                SELECT
                    MIN(transaction_date) AS min_date,
                    MAX(transaction_date) AS max_date
                FROM {source}
            """,
        },
        {
            "label": "monthly_totals",
            "sql": f"""
                SELECT
                    DATE_TRUNC('MONTH', transaction_date)    AS month,
                    COUNT(*)                                  AS total,
                    SUM(CASE WHEN is_fraud = TRUE THEN 1 ELSE 0 END) AS fraud_count
                FROM {source}
                GROUP BY 1
                ORDER BY 1
            """,
        },
        {
            "label": "country_profile",
            "sql": f"""
                SELECT
                    transaction_country      AS country,
                    COUNT(*)                 AS total,
                    SUM(CASE WHEN is_fraud = TRUE THEN 1 ELSE 0 END) AS fraud_count
                FROM {source}
                GROUP BY 1
                ORDER BY 2 DESC
            """,
        },
        {
            "label": "channel_profile",
            "sql": f"""
                SELECT
                    channel                  AS channel,
                    COUNT(*)                 AS total,
                    SUM(CASE WHEN is_fraud = TRUE THEN 1 ELSE 0 END) AS fraud_count
                FROM {source}
                GROUP BY 1
                ORDER BY 2 DESC
            """,
        },
        {
            "label": "type_profile",
            "sql": f"""
                SELECT
                    transaction_type         AS transaction_type,
                    COUNT(*)                 AS total,
                    SUM(CASE WHEN is_fraud = TRUE THEN 1 ELSE 0 END) AS fraud_count
                FROM {source}
                GROUP BY 1
                ORDER BY 2 DESC
            """,
        },
        {
            "label": "partition_check",
            "sql": f"""
                SELECT
                    CASE
                        WHEN transaction_date < '2025-07-01T00:00:00'       THEN 'train'
                        WHEN transaction_date < '2026-01-01T00:00:00'       THEN 'validation'
                        ELSE                                                     'test'
                    END                      AS partition_label,
                    COUNT(*)                 AS total,
                    SUM(CASE WHEN is_fraud = TRUE THEN 1 ELSE 0 END) AS fraud_count
                FROM {source}
                GROUP BY 1
                ORDER BY
                    CASE partition_label
                        WHEN 'train'      THEN 1
                        WHEN 'validation' THEN 2
                        WHEN 'test'       THEN 3
                    END
            """,
        },
        {
            "label": "missing_v1_features",
            "sql": f"""
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN amount IS NULL                THEN 1 ELSE 0 END) AS null_amount,
                    SUM(CASE WHEN currency IS NULL              THEN 1 ELSE 0 END) AS null_currency,
                    SUM(CASE WHEN amount_usd IS NULL            THEN 1 ELSE 0 END) AS null_amount_usd,
                    SUM(CASE WHEN transaction_type IS NULL      THEN 1 ELSE 0 END) AS null_transaction_type,
                    SUM(CASE WHEN channel IS NULL               THEN 1 ELSE 0 END) AS null_channel,
                    SUM(CASE WHEN merchant_category IS NULL     THEN 1 ELSE 0 END) AS null_merchant_category,
                    SUM(CASE WHEN transaction_country IS NULL   THEN 1 ELSE 0 END) AS null_country,
                    SUM(CASE WHEN transaction_date IS NULL      THEN 1 ELSE 0 END) AS null_date
                FROM {source}
            """,
        },
        {
            "label": "amount_stats",
            "sql": f"""
                SELECT
                    COUNT(*)                   AS total,
                    SUM(CASE WHEN amount = 0 THEN 1 ELSE 0 END)       AS zero_amount,
                    SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END)       AS negative_amount,
                    MIN(amount)                AS min_amount,
                    MAX(amount)                AS max_amount,
                    PERCENTILE_DISC(0.01) WITHIN GROUP (ORDER BY amount) AS p01,
                    PERCENTILE_DISC(0.10) WITHIN GROUP (ORDER BY amount) AS p10,
                    PERCENTILE_DISC(0.50) WITHIN GROUP (ORDER BY amount) AS p50,
                    PERCENTILE_DISC(0.90) WITHIN GROUP (ORDER BY amount) AS p90,
                    PERCENTILE_DISC(0.99) WITHIN GROUP (ORDER BY amount) AS p99
                FROM {source}
            """,
        },
        {
            "label": "currency_distribution",
            "sql": f"""
                SELECT
                    currency,
                    COUNT(*)                   AS total,
                    SUM(CASE WHEN amount_usd IS NOT NULL THEN 1 ELSE 0 END) AS has_usd
                FROM {source}
                GROUP BY 1
                ORDER BY 2 DESC
            """,
        },
        {
            "label": "fraud_score_leakage",
            "sql": f"""
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN fraud_score IS NULL    THEN 1 ELSE 0 END) AS null_fraud_score,
                    SUM(CASE WHEN fraud_score >= 70      THEN 1 ELSE 0 END) AS high_fraud_score,
                    SUM(CASE WHEN fraud_score >= 70 AND is_fraud = TRUE  THEN 1 ELSE 0 END) AS high_score_positive,
                    SUM(CASE WHEN fraud_score >= 70 AND is_fraud = FALSE THEN 1 ELSE 0 END) AS high_score_negative,
                    SUM(CASE WHEN fraud_score IS NOT NULL THEN 1 ELSE 0 END) AS scored_count,
                    AVG(CASE WHEN fraud_score IS NOT NULL THEN fraud_score END) AS mean_score,
                    MIN(CASE WHEN fraud_score IS NOT NULL THEN fraud_score END) AS min_score,
                    MAX(CASE WHEN fraud_score IS NOT NULL THEN fraud_score END) AS max_score
                FROM {source}
            """,
        },
        {
            "label": "fraud_score_vs_label",
            "sql": f"""
                SELECT
                    CASE
                        WHEN fraud_score IS NULL THEN 'null'
                        WHEN fraud_score >= 70  THEN '>=70'
                        WHEN fraud_score >= 50  THEN '50-69'
                        WHEN fraud_score >= 30  THEN '30-49'
                        ELSE                          '<30'
                    END                           AS score_bucket,
                    is_fraud,
                    COUNT(*)                      AS n
                FROM {source}
                GROUP BY 1, 2
                ORDER BY
                    CASE score_bucket
                        WHEN 'null'  THEN 1
                        WHEN '<30'   THEN 2
                        WHEN '30-49' THEN 3
                        WHEN '50-69' THEN 4
                        WHEN '>=70'  THEN 5
                    END,
                    is_fraud
            """,
        },
        {
            "label": "distinct_categories",
            "sql": f"""
                SELECT
                    COUNT(DISTINCT transaction_type)    AS n_types,
                    COUNT(DISTINCT channel)              AS n_channels,
                    COUNT(DISTINCT merchant_category)    AS n_merchant_categories,
                    COUNT(DISTINCT transaction_country)  AS n_countries,
                    COUNT(DISTINCT currency)             AS n_currencies
                FROM {source}
            """,
        },
    ]


# ──────────────────────────────────────────────
# report generation
# ──────────────────────────────────────────────


def _generate_report(
    results: List[Dict[str, Any]],
    metadata: Dict[str, Any],
    output_dir: Path,
) -> Path:
    """Write aggregate JSON evidence and an English Markdown report."""
    exec_date = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    report_dir = output_dir / exec_date
    report_dir.mkdir(parents=True, exist_ok=True)

    json_path = report_dir / "profile_data.json"
    with open(json_path, "w") as f:
        json.dump(
            {
                "metadata": metadata,
                "results": results,
            },
            f,
            indent=2,
            default=str,
            ensure_ascii=False,
        )
    print(f"✓ JSON evidence: {json_path}")

    # ── build markdown ──
    lines: List[str] = []
    lines.append(f"# Phase 0 profiling – {exec_date}")
    lines.append("")
    lines.append("## Metadata")
    lines.append("")
    lines.append(f"- **Table**: `{metadata['source_table']}`")
    lines.append(f"- **Delta version**: {metadata['delta_version']}")
    lines.append(f"- **Warehouse**: `{metadata['warehouse_id']}`")
    lines.append(f"- **Profile**: `{metadata['profile_name']}`")
    lines.append(f"- **Start UTC**: `{metadata['started_at']}`")
    lines.append("")

    # counts section
    counts_data = _extract_labeled_result(results, "row_counts")
    dup_data = _extract_labeled_result(results, "key_duplicates")
    label_data = _extract_labeled_result(results, "label_distribution")

    lines.append("## Row counts")
    lines.append("")
    if counts_data and dup_data and label_data:
        cr = counts_data["rows"][0]
        dr = dup_data["rows"][0]
        lr = label_data["rows"][0]
        total = int(cr[0])
        distinct = int(cr[1])
        null_ids = int(cr[2])
        duplicates = int(dr[1])
        null_labels = int(lr[1])
        positives = int(lr[2])
        negatives = int(lr[3])
        prevalence = positives / total * 100 if total > 0 else 0.0

        lines.append("| Metric | Value |")
        lines.append("|---|---|")
        lines.append(f"| Dictionary estimate | 5,000,000 |")
        lines.append(f"| Previous team count | 4,425,008 |")
        lines.append(f"| **Measured rows** (v{metadata['delta_version']}) | **{total}** |")
        lines.append(f"| Distinct transaction_ids | {distinct} |")
        lines.append(f"| Null transaction_ids | {null_ids} |")
        lines.append(f"| Duplicate ids (extra rows) | {duplicates} |")
        lines.append(f"| Null is_fraud labels | {null_labels} |")
        lines.append(f"| Fraud positives | {positives} |")
        lines.append(f"| Fraud negatives | {negatives} |")
        lines.append(f"| **Fraud prevalence** | **{prevalence:.4f}%** |")
        lines.append("")

        if total != distinct:
            lines.append("**⚠ Rows ≠ distinct transaction_ids.**")
            lines.append("")

    # date range
    date_data = _extract_labeled_result(results, "date_range")
    lines.append("## Date range")
    lines.append("")
    if date_data:
        dr = date_data["rows"][0]
        lines.append(f"- **Min**: {dr[0]}")
        lines.append(f"- **Max**: {dr[1]}")
    lines.append("")

    # monthly
    lines.append("## Monthly distribution")
    lines.append("")
    monthly = _extract_labeled_result(results, "monthly_totals")
    if monthly:
        lines.append("| Month | Total | Fraud | Prevalence |")
        lines.append("|---|---|---|---|")
        for row in monthly["rows"]:
            m = row[0][:10]
            t = int(row[1])
            f = int(row[2])
            pv = f / t * 100 if t > 0 else 0.0
            lines.append(f"| {m} | {t} | {f} | {pv:.4f}% |")
    lines.append("")

    # partition viability
    pc = _extract_labeled_result(results, "partition_check")
    lines.append("## Temporal partition viability")
    lines.append("")
    if pc:
        lines.append("| Partition | Total | Fraud | Prevalence |")
        lines.append("|---|---|---|---|")
        for row in pc["rows"]:
            part = row[0]
            t = int(row[1])
            f = int(row[2])
            pv = f / t * 100 if t > 0 else 0.0
            if part == "train":
                part = "train (< 2025-07-01)"
            elif part == "validation":
                part = "validation (2025-07-01 – 2025-12-31)"
            elif part == "test":
                part = "test (≥ 2026-01-01)"
            lines.append(f"| {part} | {t} | {f} | {pv:.4f}% |")
    lines.append("")

    # country
    lines.append("## Country distribution")
    lines.append("")
    cty = _extract_labeled_result(results, "country_profile")
    if cty:
        lines.append("| Country | Total | Fraud | Prevalence |")
        lines.append("|---|---|---|---|")
        for row in cty["rows"]:
            t = int(row[1])
            f = int(row[2])
            pv = f / t * 100 if t > 0 else 0
            lines.append(f"| {row[0]} | {t} | {f} | {pv:.4f}% |")
    lines.append("")

    # channel
    lines.append("## Channel")
    lines.append("")
    ch = _extract_labeled_result(results, "channel_profile")
    if ch:
        lines.append("| Channel | Total | Fraud | Prevalence |")
        lines.append("|---|---|---|---|")
        for row in ch["rows"]:
            t = int(row[1])
            f = int(row[2])
            pv = f / t * 100 if t > 0 else 0
            lines.append(f"| {row[0]} | {t} | {f} | {pv:.4f}% |")
    lines.append("")

    # transaction type
    lines.append("## Transaction type")
    lines.append("")
    tp = _extract_labeled_result(results, "type_profile")
    if tp:
        lines.append("| Type | Total | Fraud | Prevalence |")
        lines.append("|---|---|---|---|")
        for row in tp["rows"]:
            t = int(row[1])
            f = int(row[2])
            pv = f / t * 100 if t > 0 else 0
            lines.append(f"| {row[0]} | {t} | {f} | {pv:.4f}% |")
    lines.append("")

    # missing values
    mv = _extract_labeled_result(results, "missing_v1_features")
    lines.append("## Missing values (V1 candidate features)")
    lines.append("")
    if mv:
        mr = mv["rows"][0]
        total_mv = int(mr[0])
        lines.append("| Column | Missing | Pct |")
        lines.append("|---|---|---|")
        cols = [
            "amount", "currency", "amount_usd", "transaction_type",
            "channel", "merchant_category", "transaction_country",
            "transaction_date",
        ]
        for i, col in enumerate(cols, start=1):
            missing = int(mr[i])
            pct = missing / total_mv * 100 if total_mv > 0 else 0
            lines.append(f"| `{col}` | {missing} | {pct:.2f}% |")
    lines.append("")

    # amount stats
    am = _extract_labeled_result(results, "amount_stats")
    lines.append("## Amount distribution")
    lines.append("")
    if am:
        ar = am["rows"][0]
        lines.append("| Stat | Value |")
        lines.append("|---|---|")
        labels_amt = [
            "total", "zero_amount", "negative_amount",
            "min", "max", "p01", "p10", "p50", "p90", "p99",
        ]
        for i, lbl in enumerate(labels_amt):
            lines.append(f"| {lbl} | {ar[i]} |")
    lines.append("")

    # currency
    cur = _extract_labeled_result(results, "currency_distribution")
    lines.append("## Currency distribution")
    lines.append("")
    if cur:
        lines.append("| Currency | Total | Has amount_usd |")
        lines.append("|---|---|---|")
        for row in cur["rows"]:
            lines.append(f"| {row[0]} | {row[1]} | {row[2]} |")
    lines.append("")

    # fraud_score leakage
    fs = _extract_labeled_result(results, "fraud_score_leakage")
    lines.append("## fraud_score leakage diagnosis")
    lines.append("")
    if fs:
        sr = fs["rows"][0]
        lines.append("| Metric | Value |")
        lines.append("|---|---|")
        lines.append(f"| Scored rows | {sr[5]} |")
        lines.append(f"| Null fraud_score | {sr[1]} |")
        lines.append(f"| fraud_score >= 70 (total) | {sr[2]} |")
        lines.append(f"| ≥70 AND is_fraud = TRUE | {sr[3]} |")
        lines.append(f"| ≥70 AND is_fraud = FALSE | {sr[4]} |")
        lines.append(f"| Mean (non-null) | {sr[6]} |")
        lines.append(f"| Min (non-null) | {sr[7]} |")
        lines.append(f"| Max (non-null) | {sr[8]} |")
    lines.append("")

    fsvl = _extract_labeled_result(results, "fraud_score_vs_label")
    if fsvl:
        lines.append("| Score bucket | is_fraud | Count |")
        lines.append("|---|---|---|")
        for row in fsvl["rows"]:
            lines.append(f"| {row[0]} | {row[1]} | {row[2]} |")
    lines.append("")

    # distinct categories
    dc = _extract_labeled_result(results, "distinct_categories")
    lines.append("## Cardinality")
    lines.append("")
    if dc:
        dr = dc["rows"][0]
        lines.append("| Attribute | Distinct values |")
        lines.append("|---|---|")
        lines.append(f"| transaction_type | {dr[0]} |")
        lines.append(f"| channel | {dr[1]} |")
        lines.append(f"| merchant_category | {dr[2]} |")
        lines.append(f"| transaction_country | {dr[3]} |")
        lines.append(f"| currency | {dr[4]} |")
    lines.append("")

    # statement execution timings
    lines.append("## Statement execution timings")
    lines.append("")
    lines.append("| Label | Statement ID | State | Rows | Duration (ms) |")
    lines.append("|---|---|---|---|---|")
    for r in results:
        if "data" in r:
            d = r["data"]
            lines.append(
                f"| {r['label']} | {d['statement_id']} | {d['state']} "
                f"| {d['total_row_count']} | {d['execution_ms']} |"
            )
        elif "error" in r:
            lines.append(
                f"| {r['label']} | — | ERROR | — | — |"
            )
    lines.append("")

    # unknowns
    lines.append("## Remaining uncertainties")
    lines.append("")
    lines.append("- Training compute compatibility has not been verified.")
    lines.append("- Label origin/maturation and learnable signal are not determined by counts alone.")
    lines.append("- Timezone of `transaction_date` is not confirmed.")
    lines.append("- `amount_usd` conversion methodology audit is not complete.")
    lines.append("")

    md_path = report_dir / "profile_report.md"
    with open(md_path, "w") as f:
        f.write("\n".join(lines))
    print(f"✓ Markdown report: {md_path}")

    return report_dir


def _extract_labeled_result(results: List[Dict[str, Any]], label: str) -> Optional[Dict[str, Any]]:
    for r in results:
        if r["label"] == label and "data" in r:
            data = r["data"]
            rows = []
            for link in data["external_links"]:
                rows.extend(link["data_array"])
            return {"rows": rows, "schema": data["schema"]}
    return None


# ──────────────────────────────────────────────
# main
# ──────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Phase 0 read-only data profiling against bank_silver.transactions"
    )
    parser.add_argument(
        "--profile",
        default="personal",
        help="Databricks CLI profile name (default: personal)",
    )
    parser.add_argument(
        "--warehouse-id",
        default=os.environ.get("SQL_WAREHOUSE_ID", "07ca55766c9c5097"),
        help="Databricks SQL warehouse ID",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Parent directory for profile reports (default: ml/reports/)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned queries without connecting to Databricks",
    )
    parser.add_argument(
        "--table",
        default=SOURCE_TABLE,
        help="Fully qualified source table (default: workspace.bank_silver.transactions)",
    )
    parser.add_argument(
        "--version",
        type=int,
        default=None,
        help="Pin a specific Delta version. If unspecified, the latest version is detected via DESCRIBE HISTORY.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)

    # ── Step 1: detect delta version ──
    if args.dry_run:
        executor = DryRunExecutor()
        executor.record("detect_version", _version_query(args.table))
        queries = _profiling_queries(args.table, version=0, source_row_estimate=5_000_000)
        for q in queries:
            executor.record(q["label"], q["sql"])
        print(json.dumps({"planned_queries": executor.queries}, indent=2, ensure_ascii=False))
        return

    # resolve delta version
    if args.version is not None:
        delta_version = args.version
        print(f"Using pinned Delta version: {delta_version}")
    else:
        print("Detecting latest Delta version via DESCRIBE HISTORY …")
        result = _execute_and_fetch(
            _version_query(args.table),
            warehouse_id=args.warehouse_id,
            profile=args.profile,
            timeout_s=30,
            max_poll_s=60,
        )
        rows = []
        for link in result["external_links"]:
            rows.extend(link["data_array"])
        if not rows:
            raise RuntimeError("DESCRIBE HISTORY returned zero rows — cannot determine version.")
        latest = max(int(row[0]) for row in rows)
        delta_version = latest
        print(f"Detected latest version: {delta_version}")

    # ── Step 2: run profiling queries ──
    started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    metadata = {
        "source_table": args.table,
        "delta_version": delta_version,
        "warehouse_id": args.warehouse_id,
        "profile_name": args.profile,
        "started_at": started_at,
        "tool": "ml/profile.py",
        "phase": "0",
    }

    source_row_estimate = 5_000_000
    queries = _profiling_queries(args.table, delta_version, source_row_estimate)
    print(f"\nRunning {len(queries)} profiling queries at Delta v{delta_version} …\n")

    results: List[Dict[str, Any]] = []
    for q in queries:
        label = q["label"]
        print(f"[{label}] ", end="", flush=True)
        try:
            data = _execute_and_fetch(
                q["sql"],
                warehouse_id=args.warehouse_id,
                profile=args.profile,
                timeout_s=50,
                max_poll_s=180,
            )
            print(f"OK ({data['total_row_count']} rows, {data['execution_ms']}ms, id={data['statement_id'][:8]}…)")
            results.append({"label": label, "data": data})
        except Exception as exc:
            print(f"FAILED: {exc}")
            results.append({"label": label, "error": str(exc)})

    # ── Step 3: generate report ──
    report_dir = _generate_report(results, metadata, output_dir)
    print(f"\nDone. Report directory: {report_dir}")


if __name__ == "__main__":
    main()
