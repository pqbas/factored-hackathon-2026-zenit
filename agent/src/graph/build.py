from functools import partial

from langgraph.graph import END, START, StateGraph

from src.graph.edges import after_gate, after_paused, dispatch
from src.graph.nodes.cancel import cancel
from src.graph.nodes.classify import classify
from src.graph.nodes.gate import gate
from src.graph.nodes.load_context import load_context
from src.graph.nodes.paused import paused
from src.graph.nodes.respond import respond
from src.graph.nodes.summarize_handoff import summarize_handoff
from src.graph.state import AgentState

_RESPOND = "respond"
_CANCEL = "cancel"
_LOAD_CONTEXT = "load_context"
_SUMMARIZE_HANDOFF = "summarize_handoff"

# The nodes a routing.yaml destination may point at; load_routing validates against this.
# Kept as the single source _RESPOND/_CANCEL/_LOAD_CONTEXT feed into build_graph's
# add_node calls below, so the two can't drift apart.
GRAPH_NODES = {_RESPOND, _CANCEL, _LOAD_CONTEXT}


def build_graph(llm, classifier, routes, threshold, intent_threshold, tools_for):
    graph = StateGraph(AgentState)
    graph.add_node("gate", gate)
    graph.add_node("paused", paused)
    graph.add_node("classify", partial(classify, classifier=classifier, routes=routes, threshold=threshold))
    graph.add_node(_LOAD_CONTEXT, load_context)
    graph.add_node(
        _RESPOND,
        partial(respond, llm=llm, routes=routes, intent_threshold=intent_threshold, tools_for=tools_for),
    )
    graph.add_node(_CANCEL, cancel)
    graph.add_node(_SUMMARIZE_HANDOFF, partial(summarize_handoff, llm=llm))

    graph.add_edge(START, "gate")
    graph.add_conditional_edges("gate", after_gate, {"paused": "paused", END: END})
    graph.add_conditional_edges("paused", after_paused, {"classify": "classify", END: END})
    graph.add_conditional_edges(
        "classify",
        partial(dispatch, routes=routes, threshold=threshold, intent_threshold=intent_threshold),
        {_RESPOND: _RESPOND, _CANCEL: _CANCEL, _LOAD_CONTEXT: _LOAD_CONTEXT, END: END},
    )
    graph.add_edge(_LOAD_CONTEXT, _RESPOND)
    graph.add_conditional_edges(
        _RESPOND,
        lambda state: _SUMMARIZE_HANDOFF if state.get("handoff") else END,
        {_SUMMARIZE_HANDOFF: _SUMMARIZE_HANDOFF, END: END},
    )
    graph.add_edge(_SUMMARIZE_HANDOFF, END)
    graph.add_edge(_CANCEL, END)

    return graph.compile()
