from __future__ import annotations

import pytest

from src.graph.nodes.cancel import cancel
from src.prompts.messages import CANCEL_REPLY


@pytest.mark.parametrize("language, reply_language", [("es", "es"), ("pt", "pt"), ("other", "es")])
def test_cancel_returns_the_fixed_reply_in_the_customers_language(language, reply_language):
    result = cancel({"classification": {"language": language}})
    assert result["messages"][0].content == CANCEL_REPLY[reply_language]
