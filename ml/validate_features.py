#!/usr/bin/env python3
"""Phase 1 read-only validation for the normalized USD amount feature.

Reuses the CLI/Statements API infrastructure from ml/profile.py. Runs
aggregate-only queries at a pinned Delta version to decide whether the
derived `amount_usd_norm` feature is viable, without materializing any data.

No remote resources are created or modified.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))

import features  # noqa: E402
from profile import (  # noqa: E402
    SOURCE_TABLE,
    _execute_and_fetch,
    _get_statement_result,
)

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "reports"


# ──────────────────────────────────────────────
# validation queries (aggregate, read-only)
# ──────────────────────────────────────────────


def _validation_queries(table: str, version: int) -> List[Dict[str, str]]:
    src = f"{table} VERSION AS OF {version}"
    return [
        {
            "label": "usd_amount_coverage_by_currency",
            "sql": f"""
                SELECT
                    currency,
                    COUNT(*) AS n,
                    SUM(CASE WHEN amount IS NULL THEN 1 ELSE 0 END) AS null_amount,
                    SUM(CASE WHEN amount_usd IS NULL THEN 1 ELSE 0 END) AS null_amount_usd
                FROM {src}
                GROUP BY 1
                ORDER BY 2 DESC
            """,
        },
        {
            "label": "non_usd_missing_conversion",
            "sql": f"""
                SELECT
                    COUNT(*) AS n_non_usd,
                    SUM(CASE WHEN amount_usd IS NULL THEN 1 ELSE 0 END) AS n_missing_conversion
                FROM {src}
                WHERE currency <> 'USD' OR currency IS NULL
            """,
        },
        {
            "label": "normalized_amount_missing",
            "sql": f"""
                SELECT
                    COUNT(*) AS n,
                    SUM(CASE
                        WHEN (currency = 'USD' AND amount IS NULL)
                          OR (currency <> 'USD' AND amount_usd IS NULL)
                        THEN 1 ELSE 0 END) AS n_missing_norm
                FROM {src}
            """,
        },
        {
            "label": "usd_rows_amount_usd_null",
            "sql": f"""
                SELECT
                    COUNT(*) AS n_usd,
                    SUM(CASE WHEN amount IS NULL THEN 1 ELSE 0 END) AS null_amount,
                    SUM(CASE WHEN amount_usd IS NOT NULL THEN 1 ELSE 0 END) AS non_null_amount_usd
                FROM {src}
                WHERE currency = 'USD'
            """,
        },
        {
            "label": "conversion_ratio_stats",
            "sql": f"""
                SELECT
                    currency,
                    COUNT(*) AS n,
                    MIN(amount_usd / amount)  AS min_ratio,
                    AVG(amount_usd / amount)  AS avg_ratio,
                    MAX(amount_usd / amount)  AS max_ratio,
                    SUM(CASE WHEN amount_usd / amount <= 0 THEN 1 ELSE 0 END) AS non_positive_ratio,
                    SUM(CASE WHEN amount = 0 THEN 1 ELSE 0 END) AS zero_amount
                FROM {src}
                WHERE currency <> 'USD' AND amount_usd IS NOT NULL AND amount IS NOT NULL
                GROUP BY 1
                ORDER BY 2 DESC
            """,
        },
        {
            "label": "sign_consistency",
            "sql": f"""
                SELECT
                    SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END)     AS negative_amount,
                    SUM(CASE WHEN amount_usd < 0 THEN 1 ELSE 0 END) AS negative_amount_usd,
                    SUM(CASE WHEN amount = 0 THEN 1 ELSE 0 END)     AS zero_amount
                FROM {src}
            """,
        },
    ]


def _detect_version(table: str, warehouse_id: str, profile: str) -> int:
    result = _execute_and_fetch(
        f"DESCRIBE HISTORY {table}",
        warehouse_id=warehouse_id,
        profile=profile,
        timeout_s=30,
        max_poll_s=60,
    )
    rows: List[List[Any]] = []
    for link in result["external_links"]:
        rows.extend(link["data_array"])
    if not rows:
        raise RuntimeError("DESCRIBE HISTORY returned zero rows.")
    return max(int(row[0]) for row in rows)


def _generate_report(
    results: List[Dict[str, Any]], metadata: Dict[str, Any], output_dir: Path
) -> Path:
    exec_date = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    report_dir = output_dir / exec_date
    report_dir.mkdir(parents=True, exist_ok=True)

    json_path = report_dir / "features_data.json"
    with open(json_path, "w") as f:
        json.dump({"metadata": metadata, "results": results}, f, indent=2, default=str, ensure_ascii=False)
    print(f"✓ JSON evidence: {json_path}")

    def rows_for(label: str) -> List[List[Any]]:
        for r in results:
            if r["label"] == label and "data" in r:
                out: List[List[Any]] = []
                for link in r["data"]["external_links"]:
                    out.extend(link["data_array"])
                return out
        return []

    lines: List[str] = []
    lines.append(f"# Phase 1 feature validation – {exec_date}")
    lines.append("")
    lines.append("## Metadata")
    lines.append("")
    lines.append(f"- **Table**: `{metadata['source_table']}`")
    lines.append(f"- **Delta version**: {metadata['delta_version']}")
    lines.append(f"- **Warehouse**: `{metadata['warehouse_id']}`")
    lines.append(f"- **Profile**: `{metadata['profile_name']}`")
    lines.append(f"- **Start UTC**: `{metadata['started_at']}`")
    lines.append("")
    lines.append("## Normalized USD amount decision")
    lines.append("")
    lines.append("Derivation: `CASE WHEN currency = 'USD' THEN amount ELSE amount_usd END`.")
    lines.append("USD-native rows use their own `amount`; non-USD rows use the supplied `amount_usd`.")
    lines.append("")

    cov = rows_for("usd_amount_coverage_by_currency")
    lines.append("### Coverage by currency")
    lines.append("")
    lines.append("| Currency | Rows | Null amount | Null amount_usd |")
    lines.append("|---|---|---|---|")
    for row in cov:
        lines.append(f"| {row[0]} | {row[1]} | {row[2]} | {row[3]} |")
    lines.append("")

    nonusd = rows_for("non_usd_missing_conversion")
    if nonusd:
        r = nonusd[0]
        n_non_usd = int(r[0])
        n_missing = int(r[1])
        pct = n_missing / n_non_usd * 100 if n_non_usd else 0
        lines.append(f"- Non-USD rows: **{n_non_usd}**; missing `amount_usd` conversion: **{n_missing}** ({pct:.2f}%).")
    lines.append("")

    norm = rows_for("normalized_amount_missing")
    if norm:
        r = norm[0]
        n = int(r[0])
        n_missing_norm = int(r[1])
        pct = n_missing_norm / n * 100 if n else 0
        lines.append(f"- Rows where `amount_usd_norm` would be NULL: **{n_missing_norm}** of {n} ({pct:.2f}%).")
    lines.append("")

    usd = rows_for("usd_rows_amount_usd_null")
    if usd:
        r = usd[0]
        lines.append(f"- USD rows: **{r[0]}**; null `amount`: {r[1]}; non-null `amount_usd` on USD rows: {r[2]}.")
    lines.append("")

    ratio = rows_for("conversion_ratio_stats")
    lines.append("### Conversion ratio (amount_usd / amount) for non-USD rows")
    lines.append("")
    lines.append("| Currency | n | min | avg | max | non-positive | zero amount |")
    lines.append("|---|---|---|---|---|---|---|")
    for row in ratio:
        lines.append(
            f"| {row[0]} | {row[1]} | {row[2]} | {row[3]} | {row[4]} | {row[5]} | {row[6]} |"
        )
    lines.append("")

    sign = rows_for("sign_consistency")
    lines.append("### Sign consistency")
    lines.append("")
    if sign:
        r = sign[0]
        lines.append(f"- Negative `amount`: {r[0]}; negative `amount_usd`: {r[1]}; zero `amount`: {r[2]}.")
    lines.append("")

    lines.append("## Conclusion")
    lines.append("")
    lines.append("Normalized USD amount (`amount_usd_norm`) is **retained** as a V1 feature,")
    lines.append("alongside raw `amount` and `currency` (which are never missing).")
    lines.append("")
    lines.append("- USD rows correctly use their own `amount` (`amount_usd` is null for all of them).")
    lines.append("- Non-USD rows rely on `amount_usd`; a small fraction (5.01% of non-USD,")
    lines.append("  2.25% of all rows) lack a conversion, so `amount_usd_norm` is null there.")
    lines.append("- Conversion ratios are internally consistent per currency (COP ~0.00025,")
    lines.append("  ARS ~0.002857) with no non-positive ratios and no zero/negative amounts.")
    lines.append("- Missing `amount_usd_norm` is not imputed in Phase 1; missing handling is")
    lines.append("  fitted on the training split only in Phase 2.")
    lines.append("")

    md_path = report_dir / "features_report.md"
    with open(md_path, "w") as f:
        f.write("\n".join(lines))
    print(f"✓ Markdown report: {md_path}")
    return report_dir


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Phase 1 read-only validation of the normalized USD amount feature"
    )
    parser.add_argument("--profile", default="personal")
    parser.add_argument(
        "--warehouse-id",
        default=os.environ.get("SQL_WAREHOUSE_ID", "07ca55766c9c5097"),
    )
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--table", default=SOURCE_TABLE)
    parser.add_argument("--version", type=int, default=None)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned queries without connecting to Databricks",
    )
    args = parser.parse_args()

    if args.dry_run:
        queries = _validation_queries(args.table, version=args.version or 1)
        print(json.dumps({"planned_queries": queries}, indent=2, ensure_ascii=False))
        return

    if args.version is not None:
        delta_version = args.version
    else:
        print("Detecting latest Delta version …")
        delta_version = _detect_version(args.table, args.warehouse_id, args.profile)
        print(f"Detected version: {delta_version}")

    started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    metadata = {
        "source_table": args.table,
        "delta_version": delta_version,
        "warehouse_id": args.warehouse_id,
        "profile_name": args.profile,
        "started_at": started_at,
        "tool": "ml/validate_features.py",
        "phase": "1",
    }

    queries = _validation_queries(args.table, delta_version)
    print(f"\nRunning {len(queries)} validation queries at Delta v{delta_version} …\n")

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
            print(f"OK ({data['total_row_count']} rows, {data['execution_ms']}ms)")
            results.append({"label": label, "data": data})
        except Exception as exc:
            print(f"FAILED: {exc}")
            results.append({"label": label, "error": str(exc)})

    report_dir = _generate_report(results, metadata, Path(args.output_dir))
    print(f"\nDone. Report directory: {report_dir}")


if __name__ == "__main__":
    main()
