from __future__ import annotations

import asyncio

from src.diag import capped, run_probe, summarize


def test_summarize_returns_the_percentiles_and_the_error_names():
    times = [i / 10 for i in range(1, 21)]  # 0.1 .. 2.0
    stats = summarize("x", times, ["TimeoutError", "TimeoutError", "ValueError"])
    assert stats == {
        "probe": "x", "n": 20, "errors": ["TimeoutError", "ValueError"], "times": times,
        "p50": 1.1, "p95": 1.9, "max": 2.0, "min": 0.1,
    }


def test_summarize_without_samples_has_no_numbers():
    assert summarize("x", [], ["OSError"]) == {"probe": "x", "n": 0, "errors": ["OSError"], "times": []}


def test_samples_are_capped():
    assert capped("qwen_min", 500) == 30
    assert capped("lakebase_first", 30) == 5
    assert capped("jev", 0) == 1


def test_run_probe_counts_failures_by_type_and_never_keeps_the_message():
    calls = {"n": 0}

    async def sample():
        calls["n"] += 1
        if calls["n"] % 2 == 0:
            raise ValueError("secret-token-123")

    stats = asyncio.run(run_probe("x", sample, 4))
    assert stats["n"] == 2 and stats["errors"] == ["ValueError"]
    assert "secret-token-123" not in str(stats)
