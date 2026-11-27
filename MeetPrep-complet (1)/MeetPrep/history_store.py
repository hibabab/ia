
"""
Historique des réunions, rangé par entreprise :

    data/
      Millesima/
        meeting_20261126_101500.json
      Bpifrance/
        meeting_20261126_113000.json

Chaque fichier contient : date, type de réunion, transcription et évaluation.
load_history_context() renvoie un texte prêt à être ajouté au prompt du LLM.
"""
import datetime
import json
import re
import unicodedata
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"

# identifiant de l'interface -> nom du dossier (nom d'entreprise)
COMPANY_NAMES = {
    "millesimal": "Millesima",
    "altyn": "Altyn",
    "bouygues": "Bouygues Telecom",
    "bpi": "Bpifrance",
    "distalmotion": "Distalmotion",
}


def _slug(name: str) -> str:
    """Nom de dossier sûr (sans accents, ni caractères spéciaux)."""
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_")
    return name or "client_inconnu"


def company_dir(client_id: str) -> Path:
    name = COMPANY_NAMES.get(client_id, client_id)
    path = DATA_DIR / _slug(name)
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_meeting(client_id: str, meeting_type: str, transcript: list[dict],
                 evaluation: dict | None = None, service: str = "", context: str = "") -> Path:
    """Enregistre une réunion dans data/<entreprise>/meeting_<date>.json"""
    now = datetime.datetime.now()
    path = company_dir(client_id) / f"meeting_{now:%Y%m%d_%H%M%S}.json"
    payload = {
        "date": now.isoformat(timespec="seconds"),
        "client_id": client_id,
        "meeting_type": meeting_type,
        "service": service,
        "context": context,
        "transcript": [
            {"speaker": "Client" if t["speaker"] == "ai" else "Manager", "message": t["text"]}
            for t in transcript
        ],
        "evaluation": evaluation,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_meetings(client_id: str, limit: int = 3) -> list[dict]:
    """Les `limit` dernières réunions du client (la plus ancienne en premier)."""
    files = sorted(company_dir(client_id).glob("meeting_*.json"))[-limit:]
    meetings = []
    for f in files:
        try:
            meetings.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            continue  # fichier abîmé : on l'ignore
    return meetings


def load_history_context(client_id: str, limit: int = 3,
                         max_turns: int = 8, max_chars_per_turn: int = 300) -> str:
    """Texte résumant les réunions précédentes, à injecter dans le prompt du LLM."""
    meetings = load_meetings(client_id, limit)
    if not meetings:
        return ""

    blocks = []
    for i, m in enumerate(meetings, 1):
        service = f" — service : {m['service']}" if m.get("service") else ""
        lines = [f"Réunion {i} — {m.get('date', '?')[:10]} ({m.get('meeting_type', '?')}){service}"]
        for turn in m.get("transcript", [])[:max_turns]:
            text = turn["message"].replace("\n", " ")
            if len(text) > max_chars_per_turn:
                text = text[:max_chars_per_turn] + "…"
            lines.append(f"  {turn['speaker']} : {text}")
        ev = m.get("evaluation")
        if ev:
            lines.append(f"  Bilan : note {ev.get('score', '?')}/100 — {ev.get('resume', '')}")
            if ev.get("points_a_ameliorer"):
                lines.append("  Points à améliorer : " + " ; ".join(ev["points_a_ameliorer"]))
        blocks.append("\n".join(lines))

    return "\n\n".join(blocks)