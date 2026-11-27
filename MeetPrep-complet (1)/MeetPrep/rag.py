"""
RAG de MeetPrep : la mémoire du client, stockée dans ChromaDB (embeddings Gemini).

Ce qui est indexé (collection "meetprep_memory"), toujours étiqueté avec client_id :
  - profil       : une ligne par champ de la fiche entreprise (client_jsons/)
  - echange      : une question du client + la réponse du manager
  - resume       : résumé de la réunion
  - engagement   : promesse faite par le manager
  - objection    : objection exprimée par le client
  - point_faible / point_fort : issus de l'évaluation

Les embeddings sont calculés ici (et non par Chroma) : c'est plus simple et ça
marche avec toutes les versions de chromadb.

Utilisation en ligne de commande (ré-indexer l'historique déjà enregistré) :
    python rag.py
"""
import hashlib
import json
import os
import threading
from pathlib import Path

import chromadb
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

CHROMA_PATH = str(BASE_DIR / "chroma_db")
COLLECTION_NAME = "meetprep_memory"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-001")

TOP_K = 4            # nombre de passages renvoyés
MAX_DISTANCE = 0.7   # distance cosinus : au-delà, le passage n'est pas pertinent
CLES_IGNOREES = {"sources", "entreprises_citees", "error"}  # infos techniques du scraping

KIND_LABELS = {
    "profil": "Profil client",
    "echange": "Échange",
    "resume": "Résumé de réunion",
    "engagement": "Engagement du manager",
    "objection": "Objection du client",
    "point_faible": "Point à améliorer",
    "point_fort": "Point fort",
}

_lock = threading.Lock()
_collection = None
_embedder = None
_indexed_profiles: set[str] = set()


# ------------------------------------------------------------------ base
def _get_embedder() -> GoogleGenerativeAIEmbeddings:
    global _embedder
    if _embedder is None:
        _embedder = GoogleGenerativeAIEmbeddings(
            model=EMBEDDING_MODEL,
            google_api_key=os.getenv("GOOGLE_API_KEY"),
        )
    return _embedder


def _get_collection():
    global _collection
    with _lock:
        if _collection is None:
            client = chromadb.PersistentClient(path=CHROMA_PATH)
            _collection = client.get_or_create_collection(
                COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
            )
        return _collection


def _short_hash(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()[:10]


def _upsert(chunks: list[tuple[str, str, dict]]) -> None:
    """chunks : [(id, texte, métadonnées)]. upsert = pas de doublon si on réenregistre."""
    chunks = [c for c in chunks if c[1].strip()]
    if not chunks:
        return
    texts = [c[1][:2000] for c in chunks]
    _get_collection().upsert(
        ids=[c[0] for c in chunks],
        documents=texts,
        embeddings=_get_embedder().embed_documents(texts),
        metadatas=[{k: str(v) for k, v in c[2].items()} for c in chunks],
    )


# ------------------------------------------------------------------ indexation
def index_client_profile(client_id: str, data: dict) -> None:
    """Indexe la fiche entreprise (une seule fois par démarrage du serveur)."""
    if client_id in _indexed_profiles or not data:
        return
    _get_collection().delete(where={"$and": [{"client_id": client_id}, {"kind": "profil"}]})
    chunks = []
    for key, value in data.items():
        if key in CLES_IGNOREES or value in (None, "", "Not found"):
            continue
        if not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False)
        chunks.append((f"profil:{client_id}:{_short_hash(str(key))}", f"{key} : {value}",
                       {"client_id": client_id, "kind": "profil", "source": str(key)}))
    _upsert(chunks)
    _indexed_profiles.add(client_id)


def save_meeting(meeting_id: str, date: str, client_id: str, meeting_type: str, service: str,
                 transcript: list[dict], evaluation: dict | None = None,
                 memory: dict | None = None) -> int:
    """Découpe une réunion en morceaux étiquetés et les enregistre. Renvoie leur nombre.
    transcript : [{"speaker": "ai" | "user", "text": "..."}]"""
    base = {"client_id": client_id, "meeting_type": meeting_type, "service": service or "",
            "date": date, "meeting_id": meeting_id}
    counters: dict[str, int] = {}
    chunks: list[tuple[str, str, dict]] = []

    def add(kind: str, text: str):
        text = (text or "").strip()
        if text:
            n = counters.get(kind, 0)
            counters[kind] = n + 1
            chunks.append((f"{meeting_id}:{kind}:{n}", text, {**base, "kind": kind}))

    # 1. échanges : question du client + réponse du manager
    pending = None
    for t in transcript:
        if t["speaker"] == "ai":
            pending = t["text"]
        elif pending is not None:
            add("echange", f"Client : {pending}\nManager : {t['text']}")
            pending = None

    # 2. mémoire extraite par le LLM
    memory = memory or {}
    add("resume", memory.get("resume", ""))
    for e in memory.get("engagements", []):
        add("engagement", str(e))
    for o in memory.get("objections", []):
        add("objection", str(o))

    # 3. évaluation
    evaluation = evaluation or {}
    for p in evaluation.get("points_a_ameliorer", []):
        add("point_faible", str(p))
    for p in evaluation.get("points_positifs", []):
        add("point_fort", str(p))

    _upsert(chunks)
    return len(chunks)


# ------------------------------------------------------------------ recherche
def search(client_id: str, query: str, k: int = TOP_K, kinds: list[str] | None = None) -> list[dict]:
    """Passages les plus proches de la requête, UNIQUEMENT pour ce client."""
    where: dict = {"client_id": client_id}
    if kinds:
        where = {"$and": [where, {"kind": {"$in": kinds}}]}
    try:
        res = _get_collection().query(
            query_embeddings=[_get_embedder().embed_query(query)],
            n_results=k, where=where,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        print(f"[RAG] recherche impossible : {type(e).__name__}: {e}")
        return []
    hits = []
    for text, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
        if dist <= MAX_DISTANCE:
            hits.append({"text": text, "distance": round(dist, 3), **meta})
    return hits


def search_text(client_id: str, query: str, k: int = TOP_K, kinds: list[str] | None = None) -> str:
    """Même chose que search(), mais formaté en texte pour le LLM."""
    lines = []
    for h in search(client_id, query, k, kinds):
        tags = [KIND_LABELS.get(h.get("kind", ""), h.get("kind", ""))]
        if h.get("date"):
            tags.append(h["date"][:10])
        if h.get("meeting_type"):
            tags.append(h["meeting_type"])
        lines.append(f"- [{' | '.join(tags)}] {h['text']}")
    return "\n".join(lines)


# ------------------------------------------------------------------ ré-indexation
def reindex_history() -> int:
    """Ré-indexe data/<entreprise>/meeting_*.json (échanges + évaluation, sans appel LLM)."""
    import history_store

    total = 0
    for f in sorted(history_store.DATA_DIR.rglob("meeting_*.json")):
        try:
            m = json.loads(f.read_text(encoding="utf-8"))
            transcript = [{"speaker": "ai" if t["speaker"] == "Client" else "user", "text": t["message"]}
                          for t in m.get("transcript", [])]
            total += save_meeting(f.stem, m.get("date", ""), m.get("client_id", f.parent.name),
                                  m.get("meeting_type", ""), "", transcript, m.get("evaluation"))
        except Exception as e:
            print(f"[RAG] {f.name} ignoré : {type(e).__name__}: {e}")
    return total


if __name__ == "__main__":
    print(f"{reindex_history()} morceaux indexés.")