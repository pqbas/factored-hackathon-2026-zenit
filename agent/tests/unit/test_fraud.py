import asyncio
import json

from langchain_core.messages import HumanMessage
from src.graph.nodes.respond import _bound_tools, _hand_off
from src.graph.nodes.respond import respond
from src.schemas.routing import IntentRoute
from src.tools.fraud import fraud_assessment, fraud_tool


def test_real_training_evidence_never_becomes_a_transaction_probability():
    result = fraud_assessment()
    assert result["score_status"] == "not_validated"
    assert len(result["experiments"]) == 2
    assert result["experiments"][0]["validation_alerts"] == 7468
    assert result["experiments"][0]["validation_precision"] == 12 / 7468
    assert result["risk_score"] is None and result["fraud_prediction"] is None
    assert result["automatic_decisions_enabled"] is False


def test_missing_or_broken_reports_fail_closed(tmp_path, monkeypatch):
    monkeypatch.setenv("FRAUD_REPORT_DIR", str(tmp_path))
    (tmp_path / "training_v5_catboost_data.json").write_text('{"broken":true}')
    (tmp_path / "training_v6_advanced_data.json").write_text("invalid json")
    result = fraud_assessment()
    assert result["score_status"] == "unavailable"
    assert result["risk_score"] is None and result["review_required"] is True
    assert result["automatic_decisions_enabled"] is False


def test_container_evidence_matches_full_reports_without_repository_ml_directory(tmp_path, monkeypatch):
    import src.tools.fraud as module

    expected = fraud_assessment()
    monkeypatch.setattr(module, "_REPORTS", tmp_path / "absent-ml-directory")
    assert fraud_assessment() == expected


def test_packaged_evidence_contains_only_traced_aggregate_fields():
    import hashlib
    from src.tools.fraud import _FILES, _PACKAGED_REPORTS, _REPORTS

    for filename in _FILES:
        packaged = json.loads((_PACKAGED_REPORTS / filename).read_text())
        assert set(packaged) == {
            "evidence_source", "selected_candidate", "promotion_status",
            "model_binary_logged", "exploratory_validation",
        }
        assert packaged["evidence_source"]["sha256"] == hashlib.sha256(
            (_REPORTS / filename).read_bytes()
        ).hexdigest()
        assert set(packaged["selected_candidate"]) == {"candidate", "run_id"}
        budgets = packaged["exploratory_validation"]["frozen_budget_results"]
        assert len(budgets) == 1 and budgets[0]["budget"] == 0.01
        assert set(budgets[0]["metrics"]) == {"precision", "recall", "alerts"}


def test_a_report_cannot_enable_inference_by_claiming_promotion(tmp_path, monkeypatch):
    from src.tools.fraud import _REPORTS
    report = json.loads((_REPORTS / "training_v5_catboost_data.json").read_text())
    report["promotion_status"] = "PROMOTED"
    report["model_binary_logged"] = True
    (tmp_path / "training_v5_catboost_data.json").write_text(json.dumps(report))
    monkeypatch.setenv("FRAUD_REPORT_DIR", str(tmp_path))
    result = fraud_assessment()
    assert result["experiments"]
    assert result["risk_score"] is None and result["automatic_decisions_enabled"] is False


def test_invalid_aggregate_metrics_are_not_exposed(tmp_path, monkeypatch):
    from src.tools.fraud import _REPORTS
    report = json.loads((_REPORTS / "training_v5_catboost_data.json").read_text())
    for entry in report["exploratory_validation"]["frozen_budget_results"]:
        entry["metrics"]["precision"] = float("nan")
    (tmp_path / "training_v5_catboost_data.json").write_text(json.dumps(report))
    monkeypatch.setenv("FRAUD_REPORT_DIR", str(tmp_path))
    assert fraud_assessment()["score_status"] == "unavailable"


def test_tool_has_no_customer_or_prediction_inputs():
    tool = fraud_tool()
    assert tool.args_schema["properties"] == {}
    result = json.loads(asyncio.run(tool.ainvoke({"risk_score": 0.99, "customer_id": "other"})))
    assert result["risk_score"] is None
    assert "customer_id" not in result


def test_original_complaint_route_exposes_the_tool_and_attaches_policy_to_handoff():
    route = IntentRoute(intent="COMPLAINT", description="", examples=[], destination="respond",
                        handoff_reason="complaint")
    state = {"session": {"customer_id": "session-owner"}, "messages": [HumanMessage(content="cargo")],
             "classification": {"intent": "COMPLAINT", "language": "es"}}
    tools = asyncio.run(_bound_tools(state, route, None))
    assert [tool.name for tool in tools] == ["get_fraud_assessment"]
    # _hand_off is reached only after main's bank-row verification; no model result
    # changes its reason, verified charge or deterministic need for a person.
    result = _hand_off(state, route, {"merchant": "Verified merchant"}, {})
    facts = result["handoff"]["facts"]
    assert result["handoff"]["reason"] == "complaint"
    assert facts["verified_data"] == {"merchant": "Verified merchant"}
    assert facts["fraud_assessment"]["review_required"] is True
    assert facts["fraud_assessment"]["risk_score"] is None


def test_cancellation_has_no_fraud_assessment():
    route = IntentRoute(intent="RETENTION", description="", examples=[], destination="respond",
                        handoff_reason="retention")
    result = _hand_off({"classification": {}}, route, {}, {})
    assert "fraud_assessment" not in result["handoff"]["facts"]


def test_model_availability_is_returned_even_when_bank_tools_fail(monkeypatch):
    import importlib
    module = importlib.import_module("src.graph.nodes.respond")

    async def safe_bank_failure(*_args):
        return {"messages": []}

    monkeypatch.setattr(module, "_respond", safe_bank_failure)
    route = IntentRoute(intent="COMPLAINT", description="", examples=[], destination="respond",
                        handoff_reason="complaint")
    result = asyncio.run(respond({"use_case": "COMPLAINT"}, None, [route], 0.5, None))
    assert result["fraud_assessment"]["risk_score"] is None
    assert result["fraud_assessment"]["automatic_decisions_enabled"] is False
    assert "handoff" not in result
