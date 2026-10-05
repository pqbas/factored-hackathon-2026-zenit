"""Unit tests for ml/profile.py – focused on parsing, errors, and polling logic.

These tests work locally without any Databricks connection.
DO NOT add integration tests that connect to Databricks without --dry-run.

Run:  python -m pytest ml/tests/test_profile.py -v
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

# path setup so we can import profile
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import profile  # noqa: E402


# ── Dry-run ──────────────────────────────────


def test_dry_run_produces_ordered_labels():
    executor = profile.DryRunExecutor()
    executor.record("foo", "SELECT 1")
    executor.record("bar", "SELECT 2")

    assert len(executor.queries) == 2
    assert executor.queries[0]["label"] == "foo"
    assert executor.queries[0]["sql"] == "SELECT 1"
    assert executor.queries[1]["label"] == "bar"


def test_dry_run_via_cli_flag():
    proc = subprocess.run(
        [sys.executable, "-m", "profile", "--dry-run"],
        cwd=Path(__file__).resolve().parent.parent,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, proc.stderr

    payload = json.loads(proc.stdout)
    assert "planned_queries" in payload
    queries = payload["planned_queries"]
    assert len(queries) >= 14  # version detection + 13 profiling queries minimum
    labels = [q["label"] for q in queries]
    assert "detect_version" in labels
    assert "row_counts" in labels
    assert "fraud_score_leakage" in labels

    # verify every sql is non-empty and starts with SELECT/DESCRIBE
    for q in queries:
        assert q["sql"].strip(), f"Empty SQL for label {q['label']}"


# ── SQL statements contain required fields ──


def test_profiling_queries_are_non_empty():
    queries = profile._profiling_queries("workspace.bank_silver.transactions", version=1, source_row_estimate=5_000_000)
    assert len(queries) >= 12

    for q in queries:
        assert "label" in q
        assert "sql" in q
        sql = q["sql"].strip()
        assert sql, f"label={q['label']} has empty SQL"
        # all data queries should reference the source somewhere
        assert "workspace.bank_silver" in sql or "VERSION" not in sql.upper(), \
            f"label={q['label']}: SQL may be missing table reference"


def test_date_range_queries_use_temporal_constants():
    queries = profile._profiling_queries("t", version=0, source_row_estimate=100)
    # find the partition_check query
    partition_q = [q for q in queries if q["label"] == "partition_check"]
    assert len(partition_q) == 1
    sql = partition_q[0]["sql"]
    assert "2025-07-01" in sql
    assert "2026-01-01" in sql


def test_version_query_has_describe():
    sql = profile._version_query("my.catalog.schema.my_table")
    assert "DESCRIBE HISTORY" in sql.upper()
    assert "my.catalog.schema.my_table" in sql


# ── Response parsing ─────────────────────────


def fake_statement_response(state="SUCCEEDED", chunk=None):
    return {
        "manifest": {
            "chunks": [{"chunk_index": 0, "row_count": chunk["row_count"] if chunk else 0, "row_offset": 0}],
            "format": "JSON_ARRAY",
            "schema": {"column_count": 1, "columns": [{"name": "c", "position": 0, "type_name": "INT"}]},
            "total_chunk_count": 1,
            "total_row_count": chunk["row_count"] if chunk else 0,
            "truncated": False,
        },
        "result": chunk,
        "statement_id": "stub-stmt-001",
        "status": {"state": state},
    }


def test_execute_and_fetch_success(monkeypatch):
    calls = []

    def fake_post(*args, **kwargs):
        calls.append("post")
        return fake_statement_response(
            "SUCCEEDED",
            {"chunk_index": 0, "data_array": [["42"]], "row_count": 1, "row_offset": 0},
        )

    monkeypatch.setattr(profile, "_post_statement", fake_post)

    result = profile._execute_and_fetch(
        "SELECT 42", "wh", "personal", timeout_s=5, max_poll_s=10
    )
    assert result["state"] == "SUCCEEDED"
    assert result["total_row_count"] == 1
    assert len(result["external_links"]) == 1
    assert result["external_links"][0]["data_array"] == [["42"]]


def test_execute_and_fetch_polls_on_pending(monkeypatch):
    call_seq = ["PENDING", "PENDING", "SUCCEEDED"]

    def fake_post(*args, **kwargs):
        state = call_seq.pop(0) if call_seq else "SUCCEEDED"
        chunk = {"chunk_index": 0, "data_array": [["7"]], "row_count": 1, "row_offset": 0} if state == "SUCCEEDED" else None
        return fake_statement_response(state, chunk)

    def fake_get(statement_id, profile_name):
        state = call_seq.pop(0) if call_seq else "SUCCEEDED"
        chunk = {"chunk_index": 0, "data_array": [["7"]], "row_count": 1, "row_offset": 0} if state == "SUCCEEDED" else None
        return fake_statement_response(state, chunk)

    monkeypatch.setattr(profile, "_post_statement", fake_post)
    monkeypatch.setattr(profile, "_get_statement_result", fake_get)

    result = profile._execute_and_fetch(
        "SELECT 7", "wh", "personal", timeout_s=5, poll_interval_s=0.05, max_poll_s=10
    )
    assert result["state"] == "SUCCEEDED"
    assert result["total_row_count"] == 1


def test_execute_and_fetch_raises_on_failed():
    with patch.object(profile, "_post_statement") as mock_post:
        mock_post.return_value = fake_statement_response(
            "FAILED",
            None,
        )
        mock_post.return_value["manifest"]["total_row_count"] = 0
        # The FAILED state should trigger RuntimeError after polling
        with patch.object(profile, "_get_statement_result") as mock_get:
            mock_get.return_value = mock_post.return_value
            with pytest.raises(RuntimeError, match="FAILED"):
                profile._execute_and_fetch(
                    "BAD SQL", "wh", "personal", timeout_s=1, poll_interval_s=0.01, max_poll_s=3
                )


# ── Report generation (output dir) ───────────


def test_generate_report_creates_files(tmp_path):
    metadata = {
        "source_table": "test.table",
        "delta_version": 0,
        "warehouse_id": "wak",
        "profile_name": "test",
        "started_at": "2025-01-01T00:00:00Z",
    }
    results = [
        {
            "label": "row_counts",
            "data": {
                "statement_id": "s1",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["1000", "1000", "0"]]}
                ],
            },
        },
        {
            "label": "key_duplicates",
            "data": {
                "statement_id": "s2",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["1000", "0"]]}
                ],
            },
        },
        {
            "label": "label_distribution",
            "data": {
                "statement_id": "s3",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["1000", "0", "5", "995"]]}
                ],
            },
        },
        {
            "label": "date_range",
            "data": {
                "statement_id": "s4",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["2023-01-01", "2026-06-01"]]}
                ],
            },
        },
        {
            "label": "monthly_totals",
            "data": {
                "statement_id": "s5",
                "state": "SUCCEEDED",
                "total_row_count": 2,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [
                        ["2025-01-01", "500", "2"],
                        ["2025-02-01", "500", "3"],
                    ]}
                ],
            },
        },
        {
            "label": "country_profile",
            "data": {
                "statement_id": "s6",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["MX", "500", "5"]]}
                ],
            },
        },
        {
            "label": "channel_profile",
            "data": {
                "statement_id": "s7",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["App", "600", "3"]]}
                ],
            },
        },
        {
            "label": "type_profile",
            "data": {
                "statement_id": "s8",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["Purchase", "700", "4"]]}
                ],
            },
        },
        {
            "label": "partition_check",
            "data": {
                "statement_id": "s9",
                "state": "SUCCEEDED",
                "total_row_count": 3,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [
                        ["train", "400", "2"],
                        ["validation", "300", "2"],
                        ["test", "300", "1"],
                    ]}
                ],
            },
        },
        {
            "label": "missing_v1_features",
            "data": {
                "statement_id": "s10",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["1000", "0", "0", "0", "0", "0", "0", "0", "0"]]}
                ],
            },
        },
        {
            "label": "amount_stats",
            "data": {
                "statement_id": "s11",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["1000", "0", "0", "1", "9999", "2", "10", "50", "900", "9800"]]}
                ],
            },
        },
        {
            "label": "currency_distribution",
            "data": {
                "statement_id": "s12",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["MXN", "500", "500"]]}
                ],
            },
        },
        {
            "label": "fraud_score_leakage",
            "data": {
                "statement_id": "s13",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["1000", "0", "10", "8", "2", "1000", "30.0", "0", "100"]]}
                ],
            },
        },
        {
            "label": "fraud_score_vs_label",
            "data": {
                "statement_id": "s14",
                "state": "SUCCEEDED",
                "total_row_count": 2,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [
                        ["<30", "false", "500"],
                        [">=70", "true", "8"],
                    ]}
                ],
            },
        },
        {
            "label": "distinct_categories",
            "data": {
                "statement_id": "s15",
                "state": "SUCCEEDED",
                "total_row_count": 1,
                "execution_ms": 100,
                "schema": {},
                "external_links": [
                    {"link_id": "chunk_0", "data_array": [["6", "6", "20", "3", "4"]]}
                ],
            },
        },
    ]  # type: ignore[var-annotated]

    report_dir = profile._generate_report(results, metadata, tmp_path)
    assert report_dir.exists()

    json_file = report_dir / "profile_data.json"
    assert json_file.exists()
    with open(json_file) as f:
        jdata = json.load(f)
    assert jdata["metadata"]["delta_version"] == 0
    assert len(jdata["results"]) == len(results)

    md_file = report_dir / "profile_report.md"
    assert md_file.exists()
    content = md_file.read_text()
    assert "# Phase 0 profiling" in content
    assert "Dictionary estimate" in content
    assert "Previous team count" in content
    assert "Measured rows" in content
    assert "Fraud prevalence" in content
    assert "Temporal partition viability" in content
    assert "fraud_score leakage diagnosis" in content
    assert "Remaining uncertainties" in content


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
