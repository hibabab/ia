"""
API FastAPI qui relie l'interface Next.js au code Python.
Lancement :  uvicorn server:app --reload --port 8000
"""
import datetime
import traceback
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

import history_store
import meetprep_core as core
import voice_analysis


@asynccontextmanager
async def lifespan(app: FastAPI):
    voice_analysis.start_loading_in_background()  # 1re analyse vocale plus rapide
    yield


app = FastAPI(title="MeetPrep API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Turn(BaseModel):
    speaker: Literal["ai", "user"]
    text: str


class ChatRequest(BaseModel):
    clientId: str
    meetingType: str
    service: str = ""
    context: str = ""   # consignes libres saisies par le manager
    messages: list[Turn] = []


class EvaluateRequest(BaseModel):
    clientId: str
    meetingType: str
    service: str = ""
    context: str = ""
    transcript: list[Turn]


def _index_meeting(meeting_id, date, req: EvaluateRequest, transcript, result):
    """Tâche de fond : extrait la mémoire de la réunion et l'ajoute au RAG."""
    try:
        core.save_meeting_memory(meeting_id, date, req.clientId, req.meetingType,
                                 req.service, transcript, result, req.context)
    except Exception:
        traceback.print_exc()


@app.get("/health")
def health():
    return {"status": "ok", "model": core.MODEL_NAME}


@app.post("/chat")
def chat(req: ChatRequest):
    try:
        text = core.client_reply(req.clientId, req.meetingType,
                                 [t.model_dump() for t in req.messages], req.service, req.context)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Erreur modèle : {type(e).__name__}: {e}"[:400])
    return {"text": text}


@app.post("/evaluate")
def evaluate(req: EvaluateRequest, background: BackgroundTasks):
    transcript = [t.model_dump() for t in req.transcript]
    try:
        result = core.evaluate(req.clientId, req.meetingType, transcript, req.service, req.context)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Erreur évaluation : {type(e).__name__}: {e}"[:400])

    # Historique (data/<entreprise>/) puis mémoire RAG ; une erreur ici ne bloque pas la réponse
    try:
        path = history_store.save_meeting(req.clientId, req.meetingType, transcript, result,
                                          req.service, req.context)
        date = datetime.datetime.now().isoformat(timespec="seconds")
        background.add_task(_index_meeting, path.stem, date, req, transcript, result)
    except Exception:
        traceback.print_exc()
    return result


@app.get("/history/{client_id}")
def history(client_id: str, limit: int = 10):
    return history_store.load_meetings(client_id, limit)


@app.get("/voice/status")
def voice_status():
    return voice_analysis.status()


@app.post("/voice")
async def voice(request: Request):
    """Reçoit un extrait WAV (16 kHz, mono, 16 bits) -> stress/confiance/engagement/énergie."""
    data = await request.body()
    try:
        return await run_in_threadpool(voice_analysis.analyze_wav_bytes, data)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=503, detail=str(e)[:300])