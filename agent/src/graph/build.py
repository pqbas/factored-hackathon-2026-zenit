from functools import partial

from langgraph.graph import END, START, StateGraph

from src.graph.edges import after_gate
from src.graph.nodes.gate import gate
from src.graph.nodes.respond import respond
from src.graph.state import AgentState


def build_graph(llm, checkpointer):
    graph = StateGraph(AgentState)
    graph.add_node("gate", gate)
    graph.add_node("respond", partial(respond, llm=llm))

    graph.add_edge(START, "gate")
    graph.add_conditional_edges("gate", after_gate, {"respond": "respond", END: END})
    graph.add_edge("respond", END)

    return graph.compile(checkpointer=checkpointer)
