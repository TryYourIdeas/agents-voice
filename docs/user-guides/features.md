# Features

## Text-to-Speech (Qwen3-TTS)

- **Preset speakers** — nine built-in voices: `Vivian`, `Serena`, `Uncle_Fu`, `Dylan`, `Eric`, `Ryan`,
  `Aiden`, `Ono_Anna`, `Sohee`.
- **11 languages** — `Auto`, Chinese, English, Japanese, Korean, German, French, Russian, Portuguese,
  Spanish, Italian. `Auto` lets the model infer language from the text.
- **Style instructions** — an optional free-text `instruct` field (e.g. `"Very happy."`) steers delivery
  style/emotion for preset-speaker synthesis.
- **Voice cloning** — upload (or record in-browser) ~3–10 seconds of reference audio plus its exact
  transcript to create a new custom voice. Cloned voices:
  - are validated against a strict id pattern and can't collide with preset speaker names,
  - are persisted to disk (`/voices`) and automatically restored on every service restart,
  - become immediately selectable in the speaker list alongside the presets,
  - can be deleted individually, which also removes their persisted files.
- **Toggleable cloning** — voice cloning (and the extra base model it requires) can be disabled entirely
  via `QWEN_TTS_ENABLE_CLONE=false` to save VRAM on deployments that only need preset speakers.

## Speech-to-Text — two selectable engines

The UI's "Transcribe speech" panel includes an **Engine** selector so you can choose which
speech-to-text backend handles a given request:

### Whisper (`whisper-large-v3-turbo`)

- General-purpose ASR via `transformers`.
- **Transcribe** or **Translate to English** modes.
- Optional explicit source language (10 languages offered in the UI), or auto-detect.
- Chunked long-form decoding (configurable chunk length/batch size) for audio longer than a few seconds.
- Optional word/segment timestamps.

### Qwen (Qwen3-ASR-1.7B)

- Newer ASR model supporting a much broader language set (30+ languages/dialects, including multiple
  Chinese dialects and Cantonese).
- **Transcribe only** — no translation mode. Selecting the Qwen engine in the UI automatically disables
  and resets the Task selector to "Transcribe".
- Returns the detected/used language alongside the transcript.
- Optional timestamps (returned as `chunks`, matching the shape Whisper returns, for UI compatibility).

Both engines accept the same kinds of audio uploads (any format `ffmpeg` can decode — e.g. WAV, MP3,
WebM, OGG) and are normalized to mono audio before inference, so switching engines requires no change
to how you record or upload audio.

## Web UI (Nuxt 3)

- **Single-page app** (`ui/app.vue`) covering synthesis, transcription, and voice cloning in one form.
- **Synthesize** — enter text, pick a speaker (presets + any cloned voices) and language, optionally add
  a style instruction, and play the result inline via an `<audio>` element.
- **Transcribe speech** (collapsible section) — record audio directly from the browser microphone or
  upload a file, pick the STT engine (Whisper/Qwen), language, and task, then view/edit the transcript
  and optionally send it straight into the synthesis text field ("Use as synthesis input").
- **Clone a new voice** (collapsible section) — record or upload reference audio, provide its transcript
  and an optional custom voice id, and the new voice becomes selectable immediately after cloning
  succeeds.
- **In-browser recording** for both transcription and cloning via `MediaRecorder`/`getUserMedia` — no
  separate recording tool needed.
- **Live voice list** — the speaker/voice dropdowns are refreshed from the TTS service on page load, so
  newly cloned or deleted voices are reflected without a rebuild.
- All backend calls are proxied server-side by Nuxt's Nitro server, so API keys/service URLs never reach
  the browser and CORS is not a concern.

## Operational features

- **Health endpoints** (`GET /health`) on every backend service report model-load status, model id, and
  device, suitable for Docker healthchecks or external monitoring.
- **Model & voice persistence** across container restarts via the `models/` and `voices/` bind mounts.
- **GPU or CPU** — every backend service can run on an NVIDIA GPU (default) or be rebuilt for CPU-only
  inference via a Docker build arg.

## ai-extension

A Chrome side-panel extension for chatting with an AI agent about the page you're browsing:

- **Use selection** — attaches the currently selected text on the page as context.
- **Use page** — attaches the whole page's visible text as context.
- Chat with per-session memory (the conversation continues across turns within one side
  panel session).
- The agent can critically review attached text (arguments, evidence, clarity, bias) via
  its `critique-text` skill, or answer general questions.
