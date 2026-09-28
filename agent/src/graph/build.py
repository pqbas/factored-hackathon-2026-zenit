from functools import partial

from langgraph.graph import END, START, StateGraph

from src.graph.edges import after_gate, dispatch
from src.graph.nodes.cancel import cancel
from src.graph.nodes.classify import classify
from src.graph.nodes.gate import gate
from src.graph.nodes.respond import respond
from src.graph.state import AgentState

_RESPOND = "respond"
_CANCEL = "cancel"

# The nodes a routing.yaml destination may point at; load_routing validates against this.
# Kept as the single source _RESPOND/_CANCEL feed into build_graph's add_node calls below,
# so the two can't drift apart.
GRAPH_NODES = {_RESPOND, _CANCEL}


def build_graph(llm, checkpointer, jev, routes, threshold, intent_threshold):
    graph = StateGraph(AgentState)
    graph.add_node("gate", gate)
    graph.add_node("classify", partial(classify, jev=jev, routes=routes, threshold=threshold))
    graph.add_node(
        _RESPOND, partial(respond, llm=llm, routes=routes, intent_threshold=intent_threshold)
    )
    graph.add_node(_CANCEL, cancel)

    graph.add_edge(START, "gate")
    graph.add_conditional_edges("gate", after_gate, {"classify": "classify", END: END})
    graph.add_conditional_edges(
        "classify",
        partial(dispatch, routes=routes, threshold=threshold, intent_threshold=intent_threshold),
        {_RESPOND: _RESPOND, _CANCEL: _CANCEL, END: END},
    )
    graph.add_edge(_RESPOND, END)
    graph.add_edge(_CANCEL, END)

    return graph.compile(checkpointer=checkpointer)
