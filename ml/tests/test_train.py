"""Local tests for training-contract helpers; no Spark or remote calls."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import train


def test_budget_threshold_never_splits_tied_scores():
    groups = [(0.9, 2, 2), (0.8, 2, 1), (0.7, 6, 0)]
    assert train.budget_threshold_from_counts(groups, total_rows=10, budget=0.3) == 0.9


def test_budget_threshold_uses_largest_complete_group_under_capacity():
    groups = [(0.9, 2, 2), (0.8, 2, 1), (0.7, 6, 0)]
    assert train.budget_threshold_from_counts(groups, total_rows=10, budget=0.4) == 0.8


def test_budget_threshold_returns_none_when_first_tie_exceeds_capacity():
    assert train.budget_threshold_from_counts([(0.9, 3, 1)], 10, 0.2) is None


def test_budget_threshold_handles_invalid_inputs():
    assert train.budget_threshold_from_counts([(0.9, 1, 1)], 0, 0.1) is None
    assert train.budget_threshold_from_counts([(0.9, 1, 1)], 10, 0.0) is None


def test_metric_ratio_is_undefined_for_zero_denominator():
    assert train._metric_ratio(0, 0) is None
    assert train._metric_ratio(1, 4) == 0.25


def test_candidate_selection_uses_exact_validation_area_under_pr_winner():
    linear = {"record": {"validation_area_under_pr": 0.00092, "model": "linear"}}
    tree = {"record": {"validation_area_under_pr": 0.00099, "model": "tree"}}
    assert train.select_candidate_by_validation_ap([linear, tree]) is tree


def test_candidate_selection_rejects_empty_candidates():
    try:
        train.select_candidate_by_validation_ap([])
    except ValueError as exc:
        assert "successful candidate" in str(exc)
    else:
        raise AssertionError("empty candidate list must fail")
