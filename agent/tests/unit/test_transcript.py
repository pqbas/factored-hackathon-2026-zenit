from langchain_core.messages import AIMessage, HumanMessage

from src.graph.nodes.classify import _transcript


def _conversation(count):
    return [
        HumanMessage(content=f"cliente {i}") if i % 2 == 0 else AIMessage(content=f"david {i}")
        for i in range(count)
    ]


def test_the_transcript_leaves_out_the_last_customer_message():
    messages = [*_conversation(2), HumanMessage(content="el actual")]
    assert _transcript(messages, 0) == "Cliente: cliente 0\nDavid: david 1"


def test_the_transcript_starts_at_the_conversation_start():
    messages = [*_conversation(6), HumanMessage(content="el actual")]
    assert _transcript(messages, 4) == "Cliente: cliente 4\nDavid: david 5"


def test_a_start_past_the_history_or_negative_is_harmless():
    messages = [*_conversation(2), HumanMessage(content="el actual")]
    assert _transcript(messages, 2) is None
    assert _transcript(messages, -5) == "Cliente: cliente 0\nDavid: david 1"


def test_the_transcript_keeps_the_last_12_messages():
    messages = [*_conversation(20), HumanMessage(content="el actual")]
    lines = _transcript(messages, 0).splitlines()
    assert len(lines) == 12
    assert lines[0] == "Cliente: cliente 8" and lines[-1] == "David: david 19"


def test_davids_messages_are_cut_to_their_last_300_characters():
    long_reply = "x" * 500 + "¿Cuál eliges?"
    messages = [AIMessage(content=long_reply), HumanMessage(content="la 1")]
    line = _transcript(messages, 0)
    assert line == "David: " + long_reply[-300:]
    assert line.endswith("¿Cuál eliges?")


def test_advisor_messages_are_labelled_and_everything_is_masked():
    messages = [
        HumanMessage(content="mi tarjeta es 4111 1111 1111 1111"),
        AIMessage(content="[Asesor] Hola, soy Ana"),
        AIMessage(content="tu cvv es 123"),
        HumanMessage(content="el actual"),
    ]
    text = _transcript(messages, 0)
    assert "4111" not in text and "123" not in text
    assert "Asesor: Hola, soy Ana" in text
    assert text.startswith("Cliente: mi tarjeta es [NÚMERO OCULTO]")
