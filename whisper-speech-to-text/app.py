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
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("whisper-stt")

MODEL_ID = os.getenv("WHISPER_MODEL", "openai/whisper-large-v3-turbo")
DEVICE = os.getenv("WHISPER_DEVICE", "cuda:0" if torch.cuda.is_available() else "cpu")
ATTN_IMPL = os.getenv("WHISPER_ATTN", "sdpa")  # "flash_attention_2" if installed
CHUNK_LENGTH_S = int(os.getenv("WHISPER_CHUNK_LENGTH_S", "30"))
BATCH_SIZE = int(os.getenv("WHISPER_BATCH_SIZE", "8"))
TARGET_SR = 16000

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
    dtype = torch.float16 if DEVICE.startswith("cuda") else torch.float32
    log.info("loading %s on %s (dtype=%s, attn=%s)", MODEL_ID, DEVICE, dtype, ATTN_IMPL)

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
        use_safetensors=True,
        attn_implementation=ATTN_IMPL,
    )
    model.to(DEVICE)
    processor = AutoProcessor.from_pretrained(MODEL_ID)

    state["pipe"] = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        chunk_length_s=CHUNK_LENGTH_S,
        batch_size=BATCH_SIZE,
        torch_dtype=dtype,
        device=DEVICE,
    )
    log.info("model ready")
    yield
    state.clear()


app = FastAPI(title="Whisper STT Service", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if state.get("pipe") is not None else "loading",
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
    pipe = state.get("pipe")
    if pipe is None:
        raise HTTPException(status_code=503, detail="model not loaded")
    if task not in ("transcribe", "translate"):
        raise HTTPException(status_code=400, detail="task must be 'transcribe' or 'translate'")

    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio upload")

    np_audio = decode_audio(data)
    if np_audio.size < TARGET_SR // 4:  # ~250ms
        raise HTTPException(status_code=400, detail="audio too short")

    generate_kwargs: dict = {"task": task}
    if language and language.lower() not in ("auto", ""):
        generate_kwargs["language"] = language.lower()

    try:
        result = pipe(
            np_audio,
            generate_kwargs=generate_kwargs,
            return_timestamps=return_timestamps,
        )
    except Exception as exc:
        log.exception("transcription failed")
        raise HTTPException(status_code=500, detail=f"transcription failed: {exc}") from exc

    response: dict = {
        "text": (result.get("text") or "").strip(),
        "task": task,
    }
    if generate_kwargs.get("language"):
        response["language"] = generate_kwargs["language"]
    if return_timestamps and "chunks" in result:
        response["chunks"] = result["chunks"]
    return response
