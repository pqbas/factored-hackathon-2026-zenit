from functools import partial

from langgraph.graph import END, START, StateGraph

from src.graph.edges import after_gate, dispatch
from src.graph.nodes.classify import classify
from src.graph.nodes.gate import gate
from src.graph.nodes.respond import respond
from src.graph.state import AgentState

_RESPOND = "respond"

# The nodes a routing.yaml destination may point at; load_routing validates against this.
# Kept as the single source _RESPOND feeds into build_graph's add_node call below, so the
# two can't drift apart.
GRAPH_NODES = {_RESPOND}


def build_graph(llm, checkpointer, jev, routes, threshold):
    graph = StateGraph(AgentState)
    graph.add_node("gate", gate)
    graph.add_node("classify", partial(classify, jev=jev, routes=routes, threshold=threshold))
    graph.add_node(_RESPOND, partial(respond, llm=llm))

    graph.add_edge(START, "gate")
    graph.add_conditional_edges("gate", after_gate, {"classify": "classify", END: END})
    graph.add_conditional_edges(
        "classify",
        partial(dispatch, routes=routes, threshold=threshold),
        {_RESPOND: _RESPOND, END: END},
    )
    graph.add_edge(_RESPOND, END)

    return graph.compile(checkpointer=checkpointer)
