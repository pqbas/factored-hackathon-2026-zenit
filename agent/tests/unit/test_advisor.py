from __future__ import annotations

from src.prompts.advisor import AdvisorPrefixStreamFilter, strip_advisor_prefix


def test_strip_advisor_prefix_drops_the_prefix_and_the_space_after_it():
    assert strip_advisor_prefix("[Asesor] Tu caso se revisa en 5 días") == "Tu caso se revisa en 5 días"


def test_strip_advisor_prefix_leaves_other_text_unchanged():
    assert strip_advisor_prefix("Hola, ¿en qué te ayudo?") == "Hola, ¿en qué te ayudo?"
    assert strip_advisor_prefix("El [Asesor] dijo") == "El [Asesor] dijo"


def test_stream_filter_drops_a_prefix_split_across_deltas():
    stream = AdvisorPrefixStreamFilter()
    out = [stream.feed("m1", delta) for delta in ["[Ase", "sor]", " Tu caso", " sigue abierto"]]
    assert "".join(out) == "Tu caso sigue abierto"


def test_stream_filter_passes_a_normal_reply_through_at_once():
    stream = AdvisorPrefixStreamFilter()
    assert stream.feed("m1", "Hola") == "Hola"
    assert stream.feed("m1", ", ¿en qué te ayudo?") == ", ¿en qué te ayudo?"


def test_stream_filter_releases_a_bracket_that_is_not_the_prefix():
    stream = AdvisorPrefixStreamFilter()
    assert stream.feed("m1", "[") == ""
    assert stream.feed("m1", "1] Consultar saldo") == "[1] Consultar saldo"


def test_stream_filter_flushes_a_reply_shorter_than_the_prefix():
    stream = AdvisorPrefixStreamFilter()
    assert stream.feed("m1", "[A") == ""
    assert stream.flush() == {"m1": "[A"}
