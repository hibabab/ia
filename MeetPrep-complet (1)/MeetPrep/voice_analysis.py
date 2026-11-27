"""
Analyse vocale réelle pour l'interface web.
Reprend la logique de analyse_tonale.py (Wav2Vec2 + librosa) SANS Streamlit ni PyAudio :
le navigateur envoie un extrait WAV (16 kHz, mono) toutes les ~5 s, ce module renvoie
des indicateurs 0-100 : stress, confiance, engagement, énergie.
"""
import io
import threading
import wave

import numpy as np

SAMPLE_RATE = 16000
EMOTION_MODEL = "superb/wav2vec2-base-superb-er"
SILENCE_RMS = 0.005  # en dessous : l'utilisateur ne parle pas

_state = {"ready": False, "loading": False, "error": None}
_lock = threading.Lock()
_extractor = None
_model = None


def load_models() -> None:
    """Charge le modèle d'émotions (téléchargement de ~360 Mo au tout premier lancement)."""
    global _extractor, _model
    with _lock:
        if _state["ready"] or _state["loading"]:
            return
        _state["loading"] = True
        _state["error"] = None
    try:
        import librosa  # noqa: F401
        import torch  # noqa: F401
        from transformers import AutoFeatureExtractor, Wav2Vec2ForSequenceClassification

        _extractor = AutoFeatureExtractor.from_pretrained(EMOTION_MODEL)
        _model = Wav2Vec2ForSequenceClassification.from_pretrained(EMOTION_MODEL)
        _model.eval()
        _state["ready"] = True
        print("[Voix] modèle d'émotions chargé")
    except Exception as e:
        _state["error"] = f"{type(e).__name__}: {e}"
        print("[Voix] échec du chargement :", _state["error"])
    finally:
        _state["loading"] = False


def start_loading_in_background() -> None:
    threading.Thread(target=load_models, daemon=True).start()


def status() -> dict:
    return dict(_state)


# ---------------------------------------------------------------- caractéristiques
def extract_features(audio: np.ndarray, sr: int):
    """Même calcul que analyse_tonale.extract_features : hauteur, volume, pauses, tremblement."""
    import librosa

    pitches, magnitudes = librosa.piptrack(y=audio, sr=sr)
    voiced = pitches[(pitches > 0) & (magnitudes > np.median(magnitudes))]
    if voiced.size == 0:  # secours : comme analyse_tonale.py
        voiced = pitches[pitches > 0]
    pitch_mean = float(np.mean(voiced)) if voiced.size > 0 else 0.0
    pitch_diff = np.diff(voiced) if voiced.size > 1 else np.array([0.0])
    jitter = float(np.mean(np.abs(pitch_diff)) / pitch_mean) if pitch_mean > 0 else 0.0
    rms = float(librosa.feature.rms(y=audio)[0].mean())
    non_silent = librosa.effects.split(audio, top_db=20)
    speech = sum(int(end - start) for start, end in non_silent)
    pause_ratio = float(1 - speech / len(audio))
    return pitch_mean, rms, pause_ratio, jitter


def analyze_emotions(audio: np.ndarray, sr: int) -> dict:
    """Probabilités neutral / happy / angry / sad (étiquettes lues dans le modèle)."""
    import torch

    inputs = _extractor(audio, sampling_rate=sr, return_tensors="pt", padding=True)
    with torch.no_grad():
        logits = _model(**inputs).logits
    probs = torch.softmax(logits, dim=-1).numpy()[0]
    names = {"neu": "neutral", "hap": "happy", "ang": "angry", "sad": "sad"}
    result = {"neutral": 0.0, "happy": 0.0, "angry": 0.0, "sad": 0.0}
    for idx, p in enumerate(probs):
        label = str(_model.config.id2label.get(idx, "")).lower()
        key = names.get(label[:3], label)
        if key in result:
            result[key] = float(p)
    return result


def generate_advice(pitch_mean, rms, pause_ratio, jitter, stress, confidence) -> str:
    """Conseil principal (mêmes règles que analyse_tonale.generate_advice)."""
    if rms < 0.01:
        return "Votre voix est très faible : rapprochez-vous du micro et parlez plus fort."
    if jitter > 0.05:
        return "Votre voix tremble un peu : respirez profondément pour stabiliser votre ton."
    if stress > 0.4:
        return "Vous semblez stressé(e) : ralentissez votre débit et adoptez un ton calme."
    if pause_ratio > 0.4:
        return "Beaucoup de pauses : essayez de parler plus fluidement."
    if confidence < 0.6:
        return "Votre ton manque d'assurance : parlez avec conviction."
    return "Votre ton est bien adapté, continuez ainsi !"


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


# ---------------------------------------------------------------- point d'entrée
def analyze_samples(audio: np.ndarray, sr: int = SAMPLE_RATE) -> dict:
    audio = audio.astype(np.float32)
    if audio.size < sr:  # moins d'1 seconde
        return {"ready": True, "speaking": False}

    level = float(np.sqrt(np.mean(audio**2)))
    if level < SILENCE_RMS:
        return {"ready": True, "speaking": False}

    peak = float(np.max(np.abs(audio)))
    emotions = analyze_emotions(audio / peak if peak > 0 else audio, sr)
    pitch_mean, rms, pause_ratio, jitter = extract_features(audio, sr)

    # Formules d'analyse_tonale.py
    stress = _clamp01(emotions["angry"] + (jitter > 0.05) * 0.2 + (pitch_mean > 180) * 0.2)
    confidence = _clamp01(emotions["happy"] + emotions["neutral"])
    # Indicateurs dérivés (pas de mesure directe dans analyse_tonale.py)
    engagement = _clamp01(1 - pause_ratio)  # parle-t-on sans longues pauses ?
    energy = _clamp01(rms / 0.25)  # 0.25 = "voix forte" dans analyse_tonale.py

    return {
        "ready": True,
        "speaking": True,
        "stress": round(stress * 100),
        "confidence": round(confidence * 100),
        "engagement": round(engagement * 100),
        "energy": round(energy * 100),
        "conseil": generate_advice(pitch_mean, rms, pause_ratio, jitter, stress, confidence),
        "details": {
            "emotions": {k: round(v, 3) for k, v in emotions.items()},
            "pitch_hz": round(pitch_mean, 1),
            "jitter": round(jitter, 4),
            "pause_ratio": round(pause_ratio, 3),
            "rms": round(rms, 4),
        },
    }


def analyze_wav_bytes(data: bytes) -> dict:
    """Reçoit un fichier WAV PCM 16 bits envoyé par le navigateur."""
    if not _state["ready"]:
        if _state["error"]:
            raise RuntimeError(f"Modèle vocal indisponible : {_state['error']}")
        start_loading_in_background()
        return {"ready": False, "loading": True}

    with wave.open(io.BytesIO(data), "rb") as w:
        sr, channels, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        frames = w.readframes(w.getnframes())
    if width != 2:
        raise ValueError("WAV 16 bits attendu")
    audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    if sr != SAMPLE_RATE:
        import librosa

        audio = librosa.resample(audio, orig_sr=sr, target_sr=SAMPLE_RATE)
    return analyze_samples(audio, SAMPLE_RATE)