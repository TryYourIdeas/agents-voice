import io
import json
import logging
import os
import re
import subprocess
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from qwen_tts import Qwen3TTSModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("qwen-tts")

CUSTOM_MODEL_NAME = os.getenv("QWEN_TTS_CUSTOM_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice")
BASE_MODEL_NAME = os.getenv("QWEN_TTS_BASE_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
DEVICE = os.getenv("QWEN_TTS_DEVICE", "cuda:0" if torch.cuda.is_available() else "cpu")
DTYPE_NAME = os.getenv("QWEN_TTS_DTYPE", "bfloat16")
ATTN_IMPL = os.getenv("QWEN_TTS_ATTN", "sdpa")
ENABLE_CLONE = os.getenv("QWEN_TTS_ENABLE_CLONE", "true").lower() == "true"
VOICES_DIR = Path(os.getenv("QWEN_TTS_VOICES_DIR", "/voices"))
REF_AUDIO_SR = 16000

_VOICE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_voices_lock = threading.Lock()

DTYPES = {
    "bfloat16": torch.bfloat16,
    "float16": torch.float16,
    "float32": torch.float32,
}

PRESET_SPEAKERS = {
    "Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric",
    "Ryan", "Aiden", "Ono_Anna", "Sohee",
}
SUPPORTED_LANGUAGES = {
    "Auto", "Chinese", "English", "Japanese", "Korean",
    "German", "French", "Russian", "Portuguese", "Spanish", "Italian",
}

state: dict = {}


def _voice_paths(voice_id: str) -> tuple[Path, Path]:
    return VOICES_DIR / f"{voice_id}.audio", VOICES_DIR / f"{voice_id}.json"


def _persist_voice(voice_id: str, audio_bytes: bytes, ref_text: str, mime: str | None) -> None:
    """Write reference audio + metadata atomically (tmp → rename)."""
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    audio_path, meta_path = _voice_paths(voice_id)

    tmp_audio = audio_path.with_name(audio_path.name + ".tmp")
    tmp_meta = meta_path.with_name(meta_path.name + ".tmp")
    tmp_audio.write_bytes(audio_bytes)
    tmp_meta.write_text(json.dumps({
        "voice_id": voice_id,
        "ref_text": ref_text,
        "mime": mime,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }, ensure_ascii=False, indent=2))
    tmp_audio.replace(audio_path)
    tmp_meta.replace(meta_path)


def _delete_persisted_voice(voice_id: str) -> None:
    audio_path, meta_path = _voice_paths(voice_id)
    audio_path.unlink(missing_ok=True)
    meta_path.unlink(missing_ok=True)


def _restore_voices(model) -> dict:
    """Replay every persisted voice through create_voice_clone_prompt at startup."""
    restored: dict = {}
    if not VOICES_DIR.exists():
        return restored
    for meta_path in sorted(VOICES_DIR.glob("*.json")):
        try:
            meta = json.loads(meta_path.read_text())
            voice_id = meta["voice_id"]
            ref_text = meta["ref_text"]
            if not _VOICE_ID_RE.match(voice_id) or voice_id in PRESET_SPEAKERS:
                log.warning("skipping invalid voice_id '%s' from %s", voice_id, meta_path)
                continue
            audio_path = VOICES_DIR / f"{voice_id}.audio"
            if not audio_path.exists():
                log.warning("missing audio for voice '%s', skipping", voice_id)
                continue
            np_audio, sr = decode_audio(audio_path.read_bytes())
            prompt = model.create_voice_clone_prompt(
                ref_audio=(np_audio, sr),
                ref_text=ref_text,
                x_vector_only_mode=False,
            )
            restored[voice_id] = {"prompt": prompt, "ref_text": ref_text}
            log.info("restored cloned voice '%s'", voice_id)
        except Exception:
            log.exception("failed to restore voice from %s", meta_path)
    return restored


def decode_audio(data: bytes, target_sr: int = REF_AUDIO_SR) -> tuple[np.ndarray, int]:
    """Decode arbitrary audio bytes (wav/webm/mp3/ogg/...) to mono float32 via ffmpeg."""
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
            timeout=30,
        )
    except subprocess.CalledProcessError as exc:
        msg = exc.stderr.decode(errors="ignore")[:300] if exc.stderr else str(exc)
        raise HTTPException(status_code=400, detail=f"audio decode failed: {msg}") from exc
    audio, sr = sf.read(io.BytesIO(proc.stdout), dtype="float32")
    return audio, sr


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("loading custom-voice model %s on %s (%s, attn=%s)",
             CUSTOM_MODEL_NAME, DEVICE, DTYPE_NAME, ATTN_IMPL)
    state["custom_voice_model"] = Qwen3TTSModel.from_pretrained(
        CUSTOM_MODEL_NAME,
        device_map=DEVICE,
        dtype=DTYPES[DTYPE_NAME],
        attn_implementation=ATTN_IMPL,
    )

    state["cloned_voices"] = {}  # voice_id -> {"prompt": <opaque>, "ref_text": str}
    if ENABLE_CLONE:
        log.info("loading voice-clone base model %s on %s", BASE_MODEL_NAME, DEVICE)
        clone_model = Qwen3TTSModel.from_pretrained(
            BASE_MODEL_NAME,
            device_map=DEVICE,
            dtype=DTYPES[DTYPE_NAME],
            attn_implementation=ATTN_IMPL,
        )
        state["clone_model"] = clone_model
        state["cloned_voices"] = _restore_voices(clone_model)
        log.info("restored %d persisted voice(s) from %s",
                 len(state["cloned_voices"]), VOICES_DIR)
    else:
        log.info("voice cloning disabled (QWEN_TTS_ENABLE_CLONE=false)")
        state["clone_model"] = None

    log.info("model(s) ready")
    yield
    state.clear()


app = FastAPI(title="Qwen3 TTS Service", lifespan=lifespan)


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    language: str = "Auto"
    speaker: str = "Ryan"
    instruct: str = ""


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if state.get("custom_voice_model") is not None else "loading",
        "custom_model": CUSTOM_MODEL_NAME,
        "base_model": BASE_MODEL_NAME if ENABLE_CLONE else None,
        "device": DEVICE,
        "dtype": DTYPE_NAME,
        "cloned_voices": len(state.get("cloned_voices", {})),
    }


@app.get("/voices")
def voices() -> dict:
    cloned = sorted(state.get("cloned_voices", {}).keys())
    return {
        "speakers": sorted(PRESET_SPEAKERS),
        "cloned": cloned,
        "languages": sorted(SUPPORTED_LANGUAGES),
        "clone_enabled": ENABLE_CLONE,
    }


@app.post("/voices/clone")
async def clone_voice(
    audio: UploadFile = File(...),
    ref_text: str = Form(..., min_length=1),
    voice_id: Optional[str] = Form(None),
) -> dict:
    if not ENABLE_CLONE or state.get("clone_model") is None:
        raise HTTPException(status_code=503, detail="voice cloning is disabled on this server")
    if voice_id and voice_id in PRESET_SPEAKERS:
        raise HTTPException(status_code=400, detail=f"'{voice_id}' is a preset speaker name")

    vid = (voice_id or f"clone-{uuid.uuid4().hex[:8]}").strip()
    if not _VOICE_ID_RE.match(vid):
        raise HTTPException(status_code=400, detail="voice_id must match [A-Za-z0-9][A-Za-z0-9_-]{0,63}")

    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio upload")

    np_audio, sr = decode_audio(data)
    if np_audio.size < sr // 2:
        raise HTTPException(status_code=400, detail="reference audio too short (need ~1s+)")

    try:
        prompt = state["clone_model"].create_voice_clone_prompt(
            ref_audio=(np_audio, sr),
            ref_text=ref_text,
            x_vector_only_mode=False,
        )
    except Exception as exc:
        log.exception("voice clone prompt creation failed")
        raise HTTPException(status_code=500, detail=f"clone failed: {exc}") from exc

    with _voices_lock:
        try:
            _persist_voice(vid, data, ref_text, audio.content_type)
        except OSError as exc:
            log.exception("failed to persist voice '%s'", vid)
            raise HTTPException(status_code=500, detail=f"persistence failed: {exc}") from exc
        state["cloned_voices"][vid] = {"prompt": prompt, "ref_text": ref_text}

    log.info("registered cloned voice '%s' (%d samples @ %d Hz)", vid, np_audio.size, sr)
    return {"voice_id": vid, "ref_text": ref_text}


@app.delete("/voices/{voice_id}")
def delete_voice(voice_id: str) -> dict:
    if not _VOICE_ID_RE.match(voice_id):
        raise HTTPException(status_code=400, detail="invalid voice_id")
    cloned = state.get("cloned_voices", {})
    if voice_id not in cloned:
        raise HTTPException(status_code=404, detail=f"unknown voice '{voice_id}'")
    with _voices_lock:
        cloned.pop(voice_id, None)
        _delete_persisted_voice(voice_id)
    return {"voice_id": voice_id, "deleted": True}


@app.post("/tts")
def synthesize(req: TTSRequest) -> Response:
    if req.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"unsupported language '{req.language}'")

    cloned = state.get("cloned_voices", {})

    try:
        if req.speaker in PRESET_SPEAKERS:
            model = state.get("custom_voice_model")
            if model is None:
                raise HTTPException(status_code=503, detail="custom-voice model not loaded")
            wavs, sr = model.generate_custom_voice(
                text=req.text,
                language=req.language,
                speaker=req.speaker,
                instruct=req.instruct,
            )
        elif req.speaker in cloned:
            model = state.get("clone_model")
            if model is None:
                raise HTTPException(status_code=503, detail="clone model not loaded")
            wavs, sr = model.generate_voice_clone(
                text=req.text,
                language=req.language,
                voice_clone_prompt=cloned[req.speaker]["prompt"],
            )
        else:
            raise HTTPException(status_code=400, detail=f"unknown speaker '{req.speaker}'")
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("synthesis failed")
        raise HTTPException(status_code=500, detail=f"synthesis failed: {exc}") from exc

    buf = io.BytesIO()
    sf.write(buf, wavs[0], sr, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="audio/wav",
        headers={"X-Sample-Rate": str(sr)},
    )
