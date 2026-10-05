"""Expose the recorded ML experiments without inventing transaction predictions."""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

from langchain_core.tools import StructuredTool

_REPORTS = Path(__file__).resolve().parents[3] / "ml" / "reports" / "2026-10-04"
_PACKAGED_REPORTS = Path(__file__).resolve().parents[2] / "configs" / "fraud-evidence"
_FILES = ("training_v5_catboost_data.json", "training_v6_advanced_data.json")


def fraud_assessment() -> dict:
    """Availability check only. Recorded validation metrics are never a charge's score.

    Even a changed V5/V6 report saying PROMOTED cannot enable inference here.
    The executable V7 artifact is served separately by get_transaction_risk;
    this availability tool never substitutes aggregate metrics for its output.
    """
    evidence = []
    default_reports = _REPORTS if _REPORTS.is_dir() else _PACKAGED_REPORTS
    report_dir = Path(os.getenv("FRAUD_REPORT_DIR", str(default_reports)))
    for filename in _FILES:
        try:
            report = json.loads((report_dir / filename).read_text())
            selected = report["selected_candidate"]
            validation = report["exploratory_validation"]
            # Keep the exported evidence small: no rows, fitted medians or customer IDs.
            operating = next(
                entry["metrics"] for entry in validation["frozen_budget_results"]
                if isinstance(entry, dict)
                and entry.get("budget", entry.get("budget_selected_on_operating_period")) == 0.01
            )
            for metric in ("precision", "recall"):
                value = operating[metric]
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
                    raise ValueError("Invalid aggregate evaluation metric")
            if not isinstance(operating["alerts"], int) or isinstance(operating["alerts"], bool) or operating["alerts"] < 0:
                raise ValueError("Invalid evaluation denominator")
            evidence.append({
                "candidate": selected["candidate"],
                "run_id": selected["run_id"],
                "promotion_status": report["promotion_status"],
                "model_binary_logged": report["model_binary_logged"],
                "validation_precision": operating["precision"],
                "validation_recall": operating["recall"],
                "validation_alerts": operating["alerts"],
            })
        except (OSError, ValueError, KeyError, TypeError, StopIteration):
            continue
    return {
        "schema_version": "1.0",
        "scope": "model_availability",
        "score_status": "not_validated" if evidence else "unavailable",
        "risk_score": None,
        "fraud_prediction": None,
        "automatic_decisions_enabled": False,
        "review_required": True,
        "reason_codes": ["NO_VALIDATED_INFERENCE_ARTIFACT", "HUMAN_REVIEW_REQUIRED"],
        "experiments": evidence,
    }


def fraud_tool() -> StructuredTool:
    async def get_fraud_assessment(**_ignored) -> str:
        return json.dumps(fraud_assessment())

    return StructuredTool.from_function(
        coroutine=get_fraud_assessment,
        name="get_fraud_assessment",
        description=(
            "Checks the availability and validation evidence of the trained fraud models. "
            "This is NOT transaction inference: risk_score and fraud_prediction are null. "
            "Never describe aggregate precision as a customer's fraud probability. "
            "Complaints require human review independently of model availability."
        ),
        args_schema={"type": "object", "properties": {}, "required": []},
        infer_schema=False,
    )
