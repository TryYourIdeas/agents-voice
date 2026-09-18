# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Five services composed via `docker-compose.yml`, GPU-backed voice AI stack:

- **`text-to-speech/`** — FastAPI service (port 8000) wrapping `Qwen3TTSModel` (Qwen3-TTS-12Hz-1.7B). Loads a `CustomVoice` model for preset speakers (`Vivian`, `Serena`, `Uncle_Fu`, `Dylan`, `Eric`, `Ryan`, `Aiden`, `Ono_Anna`, `Sohee`) and, when `QWEN_TTS_ENABLE_CLONE=true`, a second `Base` model used only for voice cloning. Cloned voices are persisted to `/voices` (`<id>.audio` + `<id>.json` with `ref_text`) and replayed through `create_voice_clone_prompt` on every startup (`_restore_voices`). Voice IDs are validated against `_VOICE_ID_RE` and cannot collide with preset speaker names.
- **`whisper-speech-to-text/`** — FastAPI service (port 8001) wrapping a `whisper-large-v3-turbo` ASR pipeline via `transformers`. Single `/stt` endpoint (multipart audio + optional `language`/`task`/`return_timestamps`).
- **`qwen-speech-to-text/`** — FastAPI service (port 8002) wrapping `Qwen3ASRModel` (Qwen/Qwen3-ASR-1.7B, via the `qwen-asr` package). Same `/stt` request/response shape as the Whisper service for drop-in compatibility, but `language` takes full names (`"English"`, `"Chinese"`, `"Auto"`, ...) matching `SUPPORTED_LANGUAGES` rather than lowercase ISO codes, and `task` only accepts `"transcribe"` (Qwen3-ASR has no translate mode).
- **`ui/`** — Nuxt 3 app (port 3000), SSR-enabled. `app.vue` is the entire client UI (single-file, no component split). `server/api/*` are thin Nitro proxy handlers (`proxyRequest`) forwarding to the TTS/STT backends — the browser never talks to those services directly. Backend URLs come from `runtimeConfig.ttsUrl`/`sttUrl`/`qwenSttUrl`, overridable via `NUXT_TTS_URL`/`NUXT_STT_URL`/`NUXT_QWEN_STT_URL` env vars (mapped in `docker-compose.yml` for the `ui` service, or `TTS_URL`/`STT_URL`/`QWEN_STT_URL` for local `nuxt dev`). The transcribe form has an Engine selector (Whisper/Qwen); the choice is sent as `?engine=qwen|whisper` on `POST /api/stt`, read via `getQuery` in `server/api/stt.post.ts` (query, not body, so it doesn't disturb the streamed multipart proxy) to pick which backend `proxyRequest` targets.
- **`llama-server/`** — thin Dockerfile (base image `debian:trixie-slim`, needed for its GLIBC 2.38/OpenSSL 3.3 build) around a prebuilt `llama.cpp` `llama-server` binary. Unlike the other services, its build context is the **repo root** (`context: .` in `docker-compose.yml`), because it packages three root-level artifacts that aren't inside `llama-server/` itself: the `llama/` directory (prebuilt `llama.cpp` binaries), `model-qwen3.5/` (the GGUF weights), and `start-llama-server.sh` (the CMD, run via `sh` since it has no shebang). Root `.dockerignore` excludes everything except those three paths so the ~17GB of unrelated repo content (`models/`, `llama.cpp/` source, `whatsap/`) isn't sent as build context. Serves an OpenAI/Ollama-compatible API on port 5050 (`/health`, `/v1/models`, etc.) — CPU-only inference, no GPU reservation needed.

All three Python services share the same pattern: audio decode (arbitrary formats → mono float32 WAV via `ffmpeg` subprocess) → model inference in a `lifespan` context manager that populates a module-level `state` dict → `/health` reports readiness by checking `state`.

`models/` and `voices/` at the repo root are bind-mounted into containers to persist HF model weights and cloned-voice reference audio across runs — do not assume these are ephemeral.

**`whatsap/`** — a separate, self-contained project (own `.git`, `package.json`, README, and `CLAUDE.md`), unrelated to the voice AI stack above and not part of `docker-compose.yml`. It's a WhatsApp bot (`whatsapp-web.js`) whose real entrypoint (`index.ts`) forwards `@ai`-prefixed chat messages to a LangChain agent backed by Anthropic's Messages API (`@langchain/anthropic`'s `ChatAnthropic`), with file/directory/bash tools and a progressive-disclosure "skills" system of its own (`whatsap/skills/`, distinct from Claude Code skills). Runs directly via Node's native TypeScript support (Node v26, no build step); requires `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`. See `whatsap/CLAUDE.md` and `whatsap/README.md` for full architecture and setup. Its web-search tool needs `TAVILY_API_KEY` set in `whatsap/.env` (see `whatsap/.env.example`) — the key was previously hardcoded in source and should be rotated in the Tavily dashboard.

## Commands

**Full stack (Docker, requires NVIDIA GPU + nvidia-container-toolkit):**
```
docker compose up --build
```
Starts `tts` (:8000, cloning disabled), `qwen-stt` (:8002), `llama-server` (:5050), and `ui` (:3000).
`stt`/Whisper (:8001) is behind a Compose profile and not started by default — see the GPU memory note
below. Healthchecks have a 300s `start_period` since model loading is slow (`llama-server`'s is 60s,
since it's a much smaller CPU-only load).

**GPU memory is the binding constraint**, not code: on a 12GB-class GPU, `tts` + `stt` + `qwen-stt`
cannot all fit at once (measured on an RTX 3060: `tts` ~3.5GB with cloning off, `qwen-stt` ~4.6GB, `stt`
~1.8GB). Two ways this is handled:
- `docker compose --profile whisper up -d stt` to add Whisper — but stop `qwen-stt` first to free VRAM.
- `docker compose -f docker-compose-clone.yml up --build` — an alternative, standalone stack (own
  Compose project `agents-voice-clone`) that runs only `tts` (`QWEN_TTS_ENABLE_CLONE=true`) + `ui`, no
  STT service, for when voice cloning is what's needed. Full details in
  `docs/user-guides/config.md#gpu-memory-budget-stt-is-opt-in`.

**UI only, local dev:**
```
cd ui
npm install
npm run dev        # nuxt dev, needs TTS_URL / STT_URL if backends aren't on localhost:8000/8001
npm run build
npm run preview
```

**CPU-only image build** for any Python service (no GPU available):
```
docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu -t <tag> ./text-to-speech
# or ./whisper-speech-to-text, ./qwen-speech-to-text
```

There are no test suites, linters, or CI configured in this repo currently.

## Documentation

`docs/user-guides/` has end-user/operator docs: `config.md` (env vars, ports, volumes), `features.md`
(what each service/UI can do), `manual.md` (UI walkthrough), `api.md` (endpoint reference for all three
backend services + the UI's proxy routes), and `api.yml` (OpenAPI 3.0 spec for the three backend
services — paths are prefixed by service name, e.g. `/whisper-speech-to-text/stt`, since the doc
combines three independently-rooted APIs into one file; each operation pins its real `servers` entry),
and `troubleshooting.md` (host-level Docker/containerd/BuildKit and NVIDIA CDI issues seen when
building or running the stack — check this before re-diagnosing a build/GPU failure from scratch).
Keep these in sync when changing request/response shapes, env vars, or adding endpoints.

## Key behaviors to preserve when editing

- `/tts` and `/voices/clone` (text-to-speech) and `/stt` (both STT services) all decode uploaded audio through an `ffmpeg` subprocess before touching the model — any new audio-accepting endpoint should reuse that pattern rather than trusting/parsing raw uploads.
- Voice IDs must satisfy `_VOICE_ID_RE` (`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`) and cannot equal a preset speaker name — enforced both on clone and on `_restore_voices` startup replay.
- Nuxt server routes under `ui/server/api/` are pure proxies (`proxyRequest`) — keep request/response streaming (multipart bodies, `audio/wav` content-type) intact rather than buffering, and don't add business logic there; it belongs in the FastAPI services.
