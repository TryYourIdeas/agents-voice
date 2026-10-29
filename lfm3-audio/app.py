"""LFM3-Audio-2B (Q4_K_M GGUF) as one service: /stt (ASR) and /tts.

Wraps llama.cpp's llama-mtmd-cli (ASR) and llama-tts (TTS), per the model
card. /stt mirrors whisper-speech-to-text's request/response (multipart
`audio`, returns {"text"}) so whatsap's STT_URL can point here unchanged.
Each request spawns the CLI (model reload from page cache, ~1-3s on GPU) —
that trades latency for a ~1.1GB footprint that is freed between requests
instead of a resident bf16 model.
"""
import asyncio
import logging
import os
import subprocess
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from huggingface_hub import hf_hub_download
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("lfm3-audio")

REPO = os.getenv("LFM3_AUDIO_REPO", "LiquidAI/LFM3-Audio-2B-GGUF")
MODEL_FILE = os.getenv("LFM3_AUDIO_FILE", "LFM3-Audio-2B-Q4_K_M.gguf")
MMPROJ_FILE = os.getenv("LFM3_AUDIO_MMPROJ", "mmproj-LFM3-Audio-2B-Q8_0.gguf")
NGL = os.getenv("LFM3_AUDIO_NGL", "99")  # GPU layers; 0 = CPU
DEBUG = os.getenv("NUXT_ADD_DEBUG_LOGS", "").lower() in ("1", "true")
MAX_TTS_CHARS = int(os.getenv("LFM3_TTS_MAX_CHARS", "1500"))
TIMEOUT_S = int(os.getenv("LFM3_AUDIO_TIMEOUT_S", "180"))

state: dict = {}
# One GPU job at a time keeps peak VRAM at a single model copy.
gpu_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("fetching %s/%s + %s", REPO, MODEL_FILE, MMPROJ_FILE)
    state["model"] = hf_hub_download(REPO, MODEL_FILE)
    state["mmproj"] = hf_hub_download(REPO, MMPROJ_FILE)
    log.info("model files ready")
    yield
    state.clear()


app = FastAPI(title="LFM3-Audio (Q4 GGUF) STT/TTS Service", lifespan=lifespan)


async def run(cmd: list[str]) -> str:
    if DEBUG:
        log.info("exec: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), TIMEOUT_S)
    except asyncio.TimeoutError:
        proc.kill()
        raise HTTPException(status_code=504, detail=f"{cmd[0]} timed out after {TIMEOUT_S}s")
    if proc.returncode != 0:
        tail = err.decode(errors="ignore")[-400:]
        log.error("%s failed (%s): %s", cmd[0], proc.returncode, tail)
        raise HTTPException(status_code=500, detail=f"{cmd[0]} failed: {tail}")
    return out.decode(errors="ignore")


@app.get("/health")
def health() -> dict:
    return {"status": "ok" if "model" in state else "loading", "model": MODEL_FILE}


@app.post("/stt")
async def transcribe(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
) -> dict:
    if "model" not in state:
        raise HTTPException(status_code=503, detail="model not loaded")
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio upload")
    sys_prompt = f"Perform ASR in {language}." if language and language.lower() != "auto" else "Perform ASR."
    with tempfile.TemporaryDirectory() as tmp:
        # Decode whatever WhatsApp sent (ogg/opus, m4a...) to 16 kHz mono WAV.
        src, wav = Path(tmp, "in.bin"), Path(tmp, "in.wav")
        src.write_bytes(data)
        try:
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(src),
                            "-ac", "1", "-ar", "16000", str(wav)],
                           check=True, capture_output=True, timeout=120)
        except subprocess.CalledProcessError as exc:
            raise HTTPException(status_code=400, detail=f"audio decode failed: {exc.stderr.decode(errors='ignore')[:300]}")
        if wav.stat().st_size < 16000 * 2 // 4:  # ~250ms of s16
            raise HTTPException(status_code=400, detail="audio too short")
        async with gpu_lock:
            text = await run(["llama-mtmd-cli", "-m", state["model"], "-mm", state["mmproj"],
                              "-ngl", NGL, "--audio", str(wav), "-sys", sys_prompt,
                              "-p", "<__media__>", "--temp", "0"])
    text = text.strip()
    if DEBUG:
        log.info("stt: %d chars", len(text))
    return {"text": text, "task": "transcribe"}


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str = Field("female", pattern="^(female|male)$")
    language: str = Field("en", pattern="^[A-Za-z-]{2,8}$")


@app.post("/tts")
async def synthesize(req: TTSRequest) -> Response:
    """Returns audio/wav (24 kHz mono)."""
    if "model" not in state:
        raise HTTPException(status_code=503, detail="model not loaded")
    if len(req.text) > MAX_TTS_CHARS:
        raise HTTPException(status_code=413, detail=f"text exceeds {MAX_TTS_CHARS} chars")
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp, "out.wav")
        async with gpu_lock:
            await run(["llama-tts", "-m", state["model"], "-mm", state["mmproj"], "-ngl", NGL,
                       "-p", req.text, "--tts-voice", req.voice, "--tts-lang", req.language,
                       "-o", str(out)])
        if not out.exists():
            raise HTTPException(status_code=500, detail="llama-tts produced no audio")
        wav = out.read_bytes()
    if DEBUG:
        log.info("tts: %d chars -> %d bytes", len(req.text), len(wav))
    return Response(content=wav, media_type="audio/wav")
