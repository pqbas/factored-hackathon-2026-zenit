from __future__ import annotations

from src.schemas.turn_outputs import turn_custom_outputs

THRESHOLD = 0.7
NO_SIGNALS = {"usage": None, "model": None, "prompt_version": None, "classifier": None}


def _classification(**overrides) -> dict:
    base = {
        "guardrail": "OK", "guardrail_probability": 0.0, "language": "es",
        "intent": "GENERAL_INQUIRY", "intent_confidence": 0.9, "sentiment": "neutral", "source": "jev",
    }
    return {**base, **overrides}


def test_a_gate_rejection_has_no_classification_fields():
    assert turn_custom_outputs("t1", None, None, THRESHOLD) == {
        "thread_id": "t1", "use_case": None, "intent": None, "language": None,
        "blocked": False, "handoff": None, "paused": False, **NO_SIGNALS,
    }


def test_a_use_case_turn_reports_the_use_case_intent_and_language():
    outputs = turn_custom_outputs("t1", _classification(language="pt"), "GENERAL_INQUIRY", THRESHOLD)
    assert outputs == {
        "thread_id": "t1", "use_case": "GENERAL_INQUIRY", "intent": "GENERAL_INQUIRY",
        "language": "pt", "blocked": False, "handoff": None, "paused": False, **NO_SIGNALS,
    }


def test_a_blocked_turn_is_marked_blocked():
    classification = _classification(guardrail="SENSITIVE_DATA", guardrail_probability=1.0, intent="OUT_OF_SCOPE")
    assert turn_custom_outputs("t1", classification, None, THRESHOLD)["blocked"] is True


def test_a_guardrail_below_the_threshold_is_not_blocked():
    classification = _classification(guardrail="PROMPT_INJECTION", guardrail_probability=0.4)
    assert turn_custom_outputs("t1", classification, None, THRESHOLD)["blocked"] is False


def test_a_handoff_turn_carries_the_handoff():
    handoff = {"reason": "complaint", "summary": "s", "facts": {"verified_data": {"card_last4": "4930"}}}
    outputs = turn_custom_outputs("t1", _classification(intent="COMPLAINT"), "COMPLAINT", THRESHOLD, handoff)
    assert outputs["handoff"] == handoff


def test_a_paused_turn_has_null_labels_and_paused_true():
    assert turn_custom_outputs("t1", None, None, THRESHOLD, paused=True) == {
        "thread_id": "t1", "use_case": None, "intent": None, "language": None,
        "blocked": False, "handoff": None, "paused": True, **NO_SIGNALS,
    }


def test_a_turn_that_is_not_paused_carries_paused_false():
    assert turn_custom_outputs("t1", _classification(), "GENERAL_INQUIRY", THRESHOLD)["paused"] is False
    assert turn_custom_outputs("t1", None, None, THRESHOLD)["paused"] is False


def test_every_turn_carries_usage_model_prompt_version_and_classifier():
    usage = {"input_tokens": 10, "output_tokens": 3}
    signals = dict(usage=usage, model="m", prompt_version="abc123def456", classifier="llm")
    expected = {"usage": usage, "model": "m", "prompt_version": "abc123def456", "classifier": "llm"}
    for outputs in (
        turn_custom_outputs("t1", _classification(), "GENERAL_INQUIRY", THRESHOLD, **signals),
        turn_custom_outputs("t1", None, None, THRESHOLD, **signals),
        turn_custom_outputs("t1", None, None, THRESHOLD, paused=True, **signals),
    ):
        assert {key: outputs[key] for key in expected} == expected
