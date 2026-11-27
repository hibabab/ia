"""
Logique IA de MeetPrep :
- client simulé = agent LangGraph avec outils (agent.py) qui s'appuie sur le RAG (rag.py)
- évaluation du manager (avec garde-fous contre les notes trop généreuses)
- extraction de la mémoire d'une réunion (résumé, engagements, objections)
"""
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

import agent as client_agent
import rag

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError("GOOGLE_API_KEY manquante : ajoutez-la dans le fichier .env")

MODEL_NAME = os.getenv("MODEL_NAME", "gemini-3.5-flash-lite")
COMPANY_NAME = os.getenv("COMPANY_NAME", "Novalys Conseil")  # entreprise (fictive) du manager
model = ChatGoogleGenerativeAI(model=MODEL_NAME, google_api_key=API_KEY, max_retries=1, timeout=60)

# identifiant de l'interface -> fichier JSON de profil
CLIENT_FILES = {
    "millesimal": "millesima_talan_profile.json",
    "altyn": "ALTYN.json",
    "bouygues": "bouygues_telecom.json",
    "bpi": "bpifrance.json",
    "distalmotion": "distalmotion.json",
}

CLIENT_EXTRA = {
    "bpi": (
        "Vos priorités : le Plan Climat (transition écologique), le Plan Industrie (industries "
        "stratégiques) et le soutien aux PME et startups innovantes. Interrogez le manager sur "
        "l'impact, la scalabilité, la sécurité de la solution IA et son alignement avec ces priorités."
    ),
}

MEETING_TYPES = {
    "decouverte": "une réunion de découverte : vous cherchez à comprendre l'offre et son intérêt.",
    "presentation": "une présentation de solution : vous écoutez, challengez et demandez des détails.",
    "negociation": "une négociation commerciale : vous discutez budget, délais et conditions, et comparez avec des concurrents.",
    "crise": "une réunion de gestion de crise : vous êtes inquiet, pressé et exigeant sur les solutions rapides.",
    "suivi": "une réunion de suivi de projet : vous demandez l'avancement, les risques et les prochains jalons.",
    "comite": "un comité de décision : vous êtes plusieurs décideurs exigeants, vous cherchez des preuves et des garanties.",
}

CRITERIA = ["clarte", "pertinence", "objections", "posture", "gestion_stress"]


# ------------------------------------------------------------------ utilitaires
def text_of(msg) -> str:
    content = msg.content
    if isinstance(content, str):
        return content.strip()
    parts = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict) and block.get("type") == "text":
            parts.append(block.get("text", ""))
    return "".join(parts).strip()


def clamp(value, low=0, high=100) -> int:
    try:
        return max(low, min(high, int(round(float(value)))))
    except (TypeError, ValueError):
        return 0


def extract_json(text: str) -> dict:
    text = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE).replace("```", "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("La réponse du LLM ne contient pas de JSON valide.")
    return json.loads(text[start:end + 1])


def transcript_to_text(transcript: list[dict]) -> str:
    return "\n".join(
        f"{'Client' if m['speaker'] == 'ai' else 'Manager'}: {m['text']}" for m in transcript
    )


def load_client_data(client_id: str) -> dict:
    filename = CLIENT_FILES.get(client_id)
    if not filename:
        return {}
    try:
        return json.loads((BASE_DIR / "client_jsons" / filename).read_text(encoding="utf-8-sig"))
    except Exception as e:
        print(f"[AI] Profil {client_id} illisible : {e}")
        return {}


# ------------------------------------------------------------------ client simulé (agent)
_agents: dict = {}          # un agent compilé par client
_profile_indexed: set = set()


def build_system_prompt(client_id: str, meeting_type: str, service: str = "", context: str = "") -> str:
    data = load_client_data(client_id)
    profile = "\n".join(f"- {k} : {v}" for k, v in data.items()
                        if k not in rag.CLES_IGNOREES) or f"Client : {client_id} (profil non disponible)."
    return f"""Vous êtes le représentant du client dans une simulation de réunion avec un manager de {COMPANY_NAME}.

PROFIL DU CLIENT :
{profile}

{CLIENT_EXTRA.get(client_id, "")}

CONTEXTE : il s'agit de {MEETING_TYPES.get(meeting_type, "une réunion commerciale.")}
Service concerné : {service or "non précisé"}
{("CONSIGNES POUR CETTE SIMULATION (données par le manager) : " + context) if context else ""}

OUTILS (votre mémoire) :
- last_meetings : résumé des réunions précédentes avec ce manager.
- search_memory : retrouve un engagement, une objection ou un sujet précis.
Avant votre première question, et chaque fois que le manager fait une promesse ou aborde un sujet
déjà discuté, consultez votre mémoire. N'inventez jamais un fait passé : si la mémoire est vide,
parlez comme pour une première rencontre.

RÈGLES :
- Posez UNE seule question claire à la fois.
- Rebondissez sur un élément précis de la réponse du manager.
- Si la réponse est vague, demandez des précisions ; rappelez ses engagements passés si pertinent.
- Exprimez des objections réalistes, restez dans votre rôle de client, ne donnez jamais de conseils.
- Ne mentionnez jamais vos outils ni que vous êtes une IA.
- Répondez en français, 3 phrases maximum.
"""


def client_reply(client_id: str, meeting_type: str, messages: list[dict],
                 service: str = "", context: str = "") -> str:
    """messages : [{"speaker": "ai" | "user", "text": "..."}] ; liste vide -> le client ouvre la réunion."""
    if client_id not in _profile_indexed:
        try:
            rag.index_client_profile(client_id, load_client_data(client_id))
        except Exception as e:
            print(f"[RAG] indexation du profil impossible : {e}")
        _profile_indexed.add(client_id)

    key = (client_id, service)  # l'agent dépend du service (recherche RAG orientée)
    if key not in _agents:
        _agents[key] = client_agent.build_client_agent(model, client_id, service)

    history = [
        SystemMessage(content=build_system_prompt(client_id, meeting_type, service, context)),
        HumanMessage(content="Commencez la réunion par une salutation et une première question concrète."),
    ]
    for m in messages or []:
        history.append(AIMessage(content=m["text"]) if m["speaker"] == "ai" else HumanMessage(content=m["text"]))

    result = _agents[key].invoke({"messages": history, "retries": 0},
                             config={"recursion_limit": 20})
    return text_of(result["messages"][-1])


# ------------------------------------------------------------------ mémoire de la réunion
def extract_meeting_memory(client_id: str, meeting_type: str, service: str, transcript: list[dict],
                           context: str = "") -> dict:
    prompt = f"""Extrais la mémoire de cette réunion commerciale (entreprise : {client_id}, type : {meeting_type}, service : {service or "non précisé"}).
Consignes données au client simulé (ne sont PAS des engagements) : {context or "aucune"}.
N'invente rien : utilise uniquement la transcription. Si une information est absente, renvoie une liste vide.

Réponds uniquement avec un JSON valide :
{{"resume": "résumé concis", "engagements": ["promesses réellement faites par le manager"], "objections": ["objections exprimées par le client"]}}

TRANSCRIPTION :
{transcript_to_text(transcript)}
"""
    data = extract_json(text_of(model.invoke([HumanMessage(content=prompt)])))
    return {
        "resume": str(data.get("resume", "")),
        "engagements": [str(x) for x in data.get("engagements", [])],
        "objections": [str(x) for x in data.get("objections", [])],
    }


# ------------------------------------------------------------------ évaluation du manager
def _score_cap(manager_msgs: list[dict]) -> int | None:
    """Plafond déterministe selon la longueur des réponses (le LLM seul est trop indulgent)."""
    words = [len(t["text"].split()) for t in manager_msgs]
    average = sum(words) / len(words)
    if max(words) < 5:
        return 10
    if average < 8:
        return 30
    if average < 15:
        return 55
    return None


def evaluate(client_id: str, meeting_type: str, transcript: list[dict],
             service: str = "", context: str = "") -> dict:
    manager_msgs = [t for t in transcript if t["speaker"] == "user" and t["text"].strip()]

    if not manager_msgs:
        return {
            "score": 0, "note_sur_10": 0,
            "resume": "Aucune réponse du manager : pas d'évaluation possible.",
            "points_positifs": [],
            "points_a_ameliorer": ["Répondre aux questions du client."],
            "justification": "Le manager n'a rien répondu pendant la simulation.",
            "criteres": {k: 0 for k in CRITERIA},
        }

    prompt = f"""Tu es un évaluateur strict et impartial de simulations de réunions commerciales.
Tu évalues UNIQUEMENT le manager. Entreprise : {client_id}. Type de réunion : {meeting_type}. Service : {service or "non précisé"}.
Contexte donné au client simulé : {context or "aucun"}.

TRANSCRIPTION :
{transcript_to_text(transcript)}

BARÈME :
- Réponses vides, de moins de 5 mots, hors sujet ou sans argument : 0 à 30/100 (jamais plus de 10 si toutes sont si courtes).
- Réponses correctes mais générales, sans exemple ni chiffre : 40 à 60/100.
- Réponses précises, argumentées, avec exemples concrets et alignées sur les priorités du client : 70 à 100/100.
- N'invente rien, cite uniquement ce qui est dans la transcription, ne sois pas indulgent par politesse.

CRITÈRES (0-100) : clarte, pertinence, objections (gestion des objections), posture (ton professionnel et assurance), gestion_stress (questions difficiles).

Réponds UNIQUEMENT avec un JSON valide :
{{"score": 0, "resume": "...", "points_positifs": [], "points_a_ameliorer": [], "justification": "...",
  "criteres": {{"clarte": 0, "pertinence": 0, "objections": 0, "posture": 0, "gestion_stress": 0}}}}
"""
    data = extract_json(text_of(model.invoke([HumanMessage(content=prompt)])))

    cap = _score_cap(manager_msgs)
    limit = lambda v: min(clamp(v), cap) if cap is not None else clamp(v)
    score = limit(data.get("score"))
    criteres_data = data.get("criteres") or {}
    return {
        "score": score,
        "note_sur_10": round(score / 10, 1),
        "resume": str(data.get("resume", "")),
        "points_positifs": [str(p) for p in data.get("points_positifs", [])],
        "points_a_ameliorer": [str(p) for p in data.get("points_a_ameliorer", [])],
        "justification": str(data.get("justification", "")),
        "criteres": {k: limit(criteres_data.get(k)) for k in CRITERIA},
    }


# ------------------------------------------------------------------ enregistrement dans le RAG
def save_meeting_memory(meeting_id: str, date: str, client_id: str, meeting_type: str, service: str,
                        transcript: list[dict], evaluation: dict | None = None, context: str = "") -> int:
    memory = extract_meeting_memory(client_id, meeting_type, service, transcript, context)
    count = rag.save_meeting(meeting_id, date, client_id, meeting_type, service,
                             transcript, evaluation, memory)
    print(f"[RAG] réunion {meeting_id} enregistrée : {count} morceaux")
    return count