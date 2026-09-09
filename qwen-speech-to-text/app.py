import io
import logging
import os
import subprocess
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from qwen_asr import Qwen3ASRModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("qwen-asr")

MODEL_ID = os.getenv("QWEN_ASR_MODEL", "Qwen/Qwen3-ASR-1.7B")
DEVICE = os.getenv("QWEN_ASR_DEVICE", "cuda:0" if torch.cuda.is_available() else "cpu")
DTYPE_NAME = os.getenv("QWEN_ASR_DTYPE", "bfloat16")
TARGET_SR = 16000

DTYPES = {
    "bfloat16": torch.bfloat16,
    "float16": torch.float16,
    "float32": torch.float32,
}

# Full language names accepted by Qwen3ASRModel.transcribe(). "Auto" maps to
# language=None (automatic language identification).
SUPPORTED_LANGUAGES = {
    "Auto", "Chinese", "English", "Cantonese", "Arabic", "German", "French",
    "Spanish", "Portuguese", "Indonesian", "Italian", "Korean", "Russian",
    "Thai", "Vietnamese", "Japanese", "Turkish", "Hindi", "Malay", "Dutch",
    "Swedish", "Danish", "Finnish", "Polish", "Czech", "Filipino", "Persian",
    "Greek", "Hungarian", "Macedonian", "Romanian",
}

state: dict = {}


def decode_audio(data: bytes, target_sr: int = TARGET_SR) -> np.ndarray:
    """Decode arbitrary audio bytes to mono float32 @ target_sr via ffmpeg."""
    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-i", "pipe:0",
                "-f", "wav", "-acodec", "pcm_s16le",
                "-ac", "1", "-ar", str(target_sr),
                "pipe:1",
            ],
            input=data,
            capture_output=True,
            check=True,
            timeout=120,
        )
    except subprocess.CalledProcessError as exc:
        msg = exc.stderr.decode(errors="ignore")[:300] if exc.stderr else str(exc)
        raise HTTPException(status_code=400, detail=f"audio decode failed: {msg}") from exc
    audio, _sr = sf.read(io.BytesIO(proc.stdout), dtype="float32")
    return audio


@asynccontextmanager
async def lifespan(_: FastAPI):
    dtype = DTYPES[DTYPE_NAME]
    log.info("loading %s on %s (dtype=%s)", MODEL_ID, DEVICE, dtype)

    state["model"] = Qwen3ASRModel.from_pretrained(
        MODEL_ID,
        dtype=dtype,
        device_map=DEVICE,
    )
    log.info("model ready")
    yield
    state.clear()


app = FastAPI(title="Qwen3 ASR Service", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if state.get("model") is not None else "loading",
        "model": MODEL_ID,
        "device": DEVICE,
    }


@app.post("/stt")
async def transcribe(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
    task: str = Form("transcribe"),
    return_timestamps: bool = Form(False),
) -> dict:
    model = state.get("model")
    if model is None:
        raise HTTPException(status_code=503, detail="model not loaded")
    if task != "transcribe":
        raise HTTPException(status_code=400, detail="task must be 'transcribe' (Qwen3-ASR does not translate)")

    lang = (language or "Auto").strip().title()
    if lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"unsupported language '{language}'")

    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio upload")

    np_audio = decode_audio(data)
    if np_audio.size < TARGET_SR // 4:  # ~250ms
        raise HTTPException(status_code=400, detail="audio too short")

    try:
        results = model.transcribe(
            audio=(np_audio, TARGET_SR),
            language=None if lang == "Auto" else lang,
            return_time_stamps=return_timestamps,
        )
    except Exception as exc:
        log.exception("transcription failed")
        raise HTTPException(status_code=500, detail=f"transcription failed: {exc}") from exc

    result = results[0]
    response: dict = {
        "text": (result.text or "").strip(),
        "task": task,
        "language": result.language,
    }
    if return_timestamps and getattr(result, "time_stamps", None):
        response["chunks"] = [
            {"text": ts.text, "timestamp": [ts.start_time, ts.end_time]}
            for ts in result.time_stamps
        ]
    return response
