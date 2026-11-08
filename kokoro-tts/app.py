"""Kokoro-82M v1.0 text-to-speech service.

POST /tts takes the same body as lfm3-audio's /tts ({text, voice: female|male,
language}) and returns audio/wav (24 kHz mono), so whatsap's TTS_URL can point
here unchanged. `voice` may also be a Kokoro voice id (e.g. "af_heart").
"""
import io
import logging
import os
import re
import threading
from contextlib import asynccontextmanager

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("kokoro-tts")

REPO = os.getenv("KOKORO_REPO", "hexgrad/Kokoro-82M")
DEVICE = os.getenv("KOKORO_DEVICE") or None  # None = cuda if available, else cpu
SPEED = float(os.getenv("KOKORO_SPEED", "1.0"))
MAX_TTS_CHARS = int(os.getenv("KOKORO_TTS_MAX_CHARS", "5000"))
DEBUG = os.getenv("NUXT_ADD_DEBUG_LOGS", "").lower() in ("1", "true")
SAMPLE_RATE = 24000

# request language -> Kokoro lang_code
LANG_CODES = {
    "en": "a", "en-us": "a", "en-gb": "b", "es": "e", "fr": "f", "hi": "h",
    "it": "i", "ja": "j", "pt": "p", "pt-br": "p", "zh": "z",
}
# lang_code -> (female, male) default voices (KOKORO_VOICE_FEMALE/MALE override for English)
DEFAULT_VOICES = {
    "a": ("af_heart", "am_michael"), "b": ("bf_emma", "bm_george"),
    "e": ("ef_dora", "em_alex"), "f": ("ff_siwis", "ff_siwis"),
    "h": ("hf_alpha", "hm_omega"), "i": ("if_sara", "im_nicola"),
    "j": ("jf_alpha", "jm_kumo"), "p": ("pf_dora", "pm_alex"),
    "z": ("zf_xiaobei", "zm_yunjian"),
}
VOICE_ID_RE = re.compile(r"^[a-z]{2}_[a-z0-9]+$")

state: dict = {}
pipelines: dict = {}
lock = threading.Lock()  # one synthesis at a time


def pick_voice(voice: str, lang_code: str) -> str:
    if voice in ("female", "male"):
        female, male = DEFAULT_VOICES[lang_code]
        if lang_code == "a":
            female = os.getenv("KOKORO_VOICE_FEMALE", female)
            male = os.getenv("KOKORO_VOICE_MALE", male)
        return female if voice == "female" else male
    return voice


def get_pipeline(lang_code: str):
    from kokoro import KPipeline
    if lang_code not in pipelines:
        pipelines[lang_code] = KPipeline(lang_code=lang_code, repo_id=REPO, device=DEVICE)
    return pipelines[lang_code]


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("loading Kokoro (%s), device=%s", REPO, DEVICE or "auto")
    get_pipeline("a")  # downloads weights + default voice, fails fast if broken
    state["ready"] = True
    log.info("kokoro ready")
    yield
    state.clear()


app = FastAPI(title="Kokoro-82M TTS Service", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok" if state.get("ready") else "loading", "model": REPO}


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str = Field("female", pattern=r"^(female|male|[a-z]{2}_[a-z0-9]+)$")
    language: str = Field("en", pattern="^[A-Za-z-]{2,8}$")


@app.post("/tts")
def synthesize(req: TTSRequest) -> Response:
    """Returns audio/wav (24 kHz mono)."""
    if not state.get("ready"):
        raise HTTPException(status_code=503, detail="model not loaded")
    if len(req.text) > MAX_TTS_CHARS:
        raise HTTPException(status_code=413, detail=f"text exceeds {MAX_TTS_CHARS} chars")
    lang_code = LANG_CODES.get(req.language.lower())
    if lang_code is None:
        raise HTTPException(status_code=400, detail=f"unsupported language '{req.language}'")
    voice = pick_voice(req.voice, lang_code)
    if not VOICE_ID_RE.match(voice):
        raise HTTPException(status_code=400, detail=f"invalid voice '{voice}'")
    try:
        with lock:
            pipeline = get_pipeline(lang_code)
            parts = [np.asarray(audio, dtype=np.float32)
                     for _, _, audio in pipeline(req.text, voice=voice, speed=SPEED)
                     if audio is not None]
    except Exception as exc:  # unknown voice id, G2P failure, ...
        if "404" in str(exc) or "Entry Not Found" in str(exc):
            raise HTTPException(status_code=400, detail=f"unknown voice '{voice}'")
        log.exception("tts failed (voice=%s lang=%s)", voice, lang_code)
        raise HTTPException(status_code=500, detail=f"synthesis failed: {exc}")
    if not parts:
        raise HTTPException(status_code=500, detail="kokoro produced no audio")
    buf = io.BytesIO()
    sf.write(buf, np.concatenate(parts), SAMPLE_RATE, format="WAV", subtype="PCM_16")
    wav = buf.getvalue()
    if DEBUG:
        log.info("tts: %d chars, voice=%s lang=%s -> %d bytes", len(req.text), voice, lang_code, len(wav))
    return Response(content=wav, media_type="audio/wav")
