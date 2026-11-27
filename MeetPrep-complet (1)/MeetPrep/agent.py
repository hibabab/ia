"""
Agent « client simulé » (LangGraph) avec vérification de la réponse.

    START -> agent -> outil demandé ? -> oui : tools -> agent
                                      -> non : verify -> OK ?  -> oui : END
                                                               -> non : agent (réécrit, 2 fois max)
"""
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

import history_store
import rag

MAX_RETRIES = 2


class Verdict(BaseModel):
    ok: bool = Field(description="True si la réponse est bonne telle quelle")
    problemes: list[str] = Field(default_factory=list, description="Problèmes constatés")
    conseil: str = Field(default="", description="Comment corriger, en une phrase")


class ClientState(MessagesState):
    retries: int


def _text(content) -> str:
    """Gemini peut renvoyer une liste de blocs au lieu d'une chaîne."""
    if isinstance(content, str):
        return content.strip()
    return "".join(b if isinstance(b, str) else b.get("text", "")
                   for b in content if isinstance(b, (str, dict))).strip()


def build_client_agent(llm, client_id: str, service: str = "", verifier_llm=None):
    @tool
    def search_memory(query: str) -> str:
        """Cherche dans la mémoire de ce client (réunions passées, engagements du manager,
        objections, profil de l'entreprise). `query` : ce que tu veux retrouver, en une phrase."""
        focused = f"{service} : {query}" if service else query
        return rag.search_text(client_id, focused) or "Aucun souvenir pertinent."

    @tool
    def last_meetings() -> str:
        """Résumé des dernières réunions déjà tenues avec ce manager (dates, échanges, bilan)."""
        return history_store.load_history_context(client_id) or "Aucune réunion précédente."

    tools = [search_memory, last_meetings]
    llm_with_tools = llm.bind_tools(tools)
    judge = (verifier_llm or llm).with_structured_output(Verdict)

    def agent_node(state: ClientState):
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    def verify_node(state: ClientState):
        msgs = state["messages"]
        answer = _text(msgs[-1].content)
        retries = state.get("retries", 0)

        manager = next((_text(m.content) for m in reversed(msgs)
                        if isinstance(m, HumanMessage) and m.name != "qc"), "")
        memoire = "\n".join(_text(m.content) for m in msgs if isinstance(m, ToolMessage)) \
                  or "(aucun souvenir consulté)"

        try:
            verdict: Verdict = judge.invoke(f"""Tu contrôles la réponse d'un CLIENT SIMULÉ dans un
entraînement de vente. Réponds uniquement par l'évaluation structurée.

Dernier message du manager :
{manager}

Souvenirs consultés par le client :
{memoire}

Réponse du client à contrôler :
{answer}

Critères :
1. Le client reste dans son rôle (il ne coache pas le manager, il ne parle pas comme un vendeur).
2. Aucune contradiction avec les souvenirs, aucun fait ou engagement passé inventé.
3. La réponse réagit au dernier message du manager.
4. Court (3 phrases maximum), une seule question à la fois, ton naturel et oral.
5. Aucune mention d'outils, de mémoire ou du fait d'être une IA.
""")
        except Exception as e:           # si le juge plante, on ne bloque pas la réunion
            print(f"[VERIF] juge indisponible : {type(e).__name__}: {e}")
            return {}

        if verdict.ok or retries >= MAX_RETRIES:
            return {}

        feedback = (
            "[Contrôle qualité] Ta réponse est refusée. "
            f"Problèmes : {'; '.join(verdict.problemes)}. "
            f"Conseil : {verdict.conseil} Réécris uniquement ta réponse de client."
        )
        return {"messages": [HumanMessage(content=feedback, name="qc")], "retries": retries + 1}

    def after_verify(state: ClientState):
        last = state["messages"][-1]
        return "agent" if isinstance(last, HumanMessage) and last.name == "qc" else END

    graph = StateGraph(ClientState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(tools))
    graph.add_node("verify", verify_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", tools_condition, {"tools": "tools", END: "verify"})
    graph.add_edge("tools", "agent")
    graph.add_conditional_edges("verify", after_verify, {"agent": "agent", END: END})
    return graph.compile()