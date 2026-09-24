# Configuration Guide

This guide covers configuring the four services in the stack: `text-to-speech`, `whisper-speech-to-text`,
`qwen-speech-to-text`, and `ui`. All services are wired together in `docker-compose.yml` at the repo root.

## Running the stack

```bash
docker compose up --build
```

| Service      | Container port | Host port | Requires GPU | Started by default |
|--------------|-----------------|-----------|--------------|---------------------|
| `tts`        | 8000            | 8000      | Yes (or CPU build) | Yes |
| `qwen-stt`   | 8002            | 8002      | Yes (or CPU build) | Yes |
| `stt`        | 8001            | 8001      | Yes (or CPU build) | No — opt-in (`whisper` profile) |
| `ui`         | 3000            | 3000      | No | Yes |

Each Python service's healthcheck has a 300s `start_period` because loading model weights on first
boot (or on a cold Hugging Face cache) is slow.

### GPU memory budget (`stt` is opt-in)

On a 12GB-class GPU, `tts` + `stt` + `qwen-stt` running simultaneously **do not fit** — even with
voice cloning disabled (see below), the combined model weights leave no room for inference activations
and typically OOM at startup (`torch.OutOfMemoryError`). Observed footprints on an RTX 3060 (12GB):

| Service | VRAM |
|---|---|
| `tts` (CustomVoice only, cloning disabled) | ~3.5 GB |
| `qwen-stt` (Qwen3-ASR-1.7B) | ~4.6 GB |
| `stt` (Whisper large-v3-turbo, fp16) | ~1.8 GB |

Because of this, `stt` (Whisper) is defined with `profiles: ["whisper"]` in `docker-compose.yml` and is
**not** started by `docker compose up` by default — the default pairing is `tts` + `qwen-stt` + `ui`,
which fits comfortably. To use Whisper instead of/alongside Qwen3-ASR:

```bash
# Stop qwen-stt first to free its VRAM, then start stt explicitly:
docker compose stop qwen-stt
docker compose --profile whisper up -d stt
```

If your GPU has more VRAM (16GB+), you can likely run all three at once — just start `stt` with
`--profile whisper` alongside the default services and watch `nvidia-smi` for headroom.

### Voice-cloning stack (`docker-compose-clone.yml`)

Voice cloning (`QWEN_TTS_ENABLE_CLONE=true`) needs `tts` to load a second ~1.7B model, which on a
12GB-class GPU leaves no room for any STT service. `docker-compose-clone.yml` is an alternative,
standalone compose file for this case: it runs **only `tts` (cloning enabled) and `ui`** — both STT
services are omitted entirely.

```bash
docker compose -f docker-compose-clone.yml up --build
```

It declares its own Compose project (`name: agents-voice-clone`), so it won't collide with containers
from the default `docker-compose.yml` — but on a single GPU you still can't run both stacks at the same
time; stop one (`docker compose down` / `docker compose -f docker-compose-clone.yml down`) before
starting the other. In this stack the transcribe form in the UI has nothing to talk to (both STT URLs
are left at their unreachable defaults on purpose) — it's for synthesis and cloning only.

### WhatsApp bot stack (`docker-compose-whatsap.yml`)

`whatsap/` (see `whatsap/CLAUDE.md`) is a separate, self-contained project — a WhatsApp bot bridging to
a LangChain/Anthropic agent — unrelated to the four voice-AI services above. `docker-compose-whatsap.yml`
runs it and its supporting services, without building or starting `tts`/`stt`/`qwen-stt`/`ui`:

```bash
docker compose -f docker-compose-whatsap.yml up --build
```

It declares its own Compose project (`name: agents-voice-whatsap`), so it won't collide with containers
from the default `docker-compose.yml`.

| Service | Container port | Host port | Requires GPU | What it does |
|---|---|---|---|---|
| `whatsap` | — | — | No | The bot itself — no HTTP port, connects out to WhatsApp Web |
| `ai-extension-server` | 4100 | 4100 | No | Backend for the `ai-extension` Chrome extension (see below) |
| `devices-ui` | 3000 | 3003 | No | Web UI for adding WhatsApp devices and scanning QR codes |
| `llama-server` | 5050 | 5050 | Yes (GPU build) | Local OpenAI/Ollama-compatible inference, used as a free Anthropic-API stand-in |
| `stt` | 8001 | 8001 | Yes | Whisper STT — transcribes voice notes sent to allow-listed chats |
| `plantuml-renderer` | 3000 | 3001 | No | Renders PlantUML diagrams for the `system-design-coach` agent's `render_diagram` tool |

**Environment:** the `whatsap`, `ai-extension-server`, and `llama-server` services load
`.env.whatsap-llama` (repo root, next to the compose file) via `env_file` — set `ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`, `MAX_TOKENS`, and `TAVILY_API_KEY` there (see the `whatsap`
and `ai-extension` env var tables below for what each does). It's `.gitignore`-worthy (contains
secrets) and not committed; create it yourself before first run.

**First run needs a way to scan each device's WhatsApp Web QR code** — either watch the foreground
logs (QR printed via `qrcode-terminal`, prefixed with the device name) or use the `devices-ui` web UI
at `http://localhost:3003` (see [`manual.md`](./manual.md#managing-whatsapp-devices) for the full
walkthrough):

```bash
docker compose -f docker-compose-whatsap.yml up --build
# watch the foreground logs for each device's QR code, or open
# http://localhost:3003 and scan it there
```

Once authenticated, each device's session persists in `./whatsap/devices/<name>/session`
(bind-mounted into the container via the shared `./whatsap/devices` volume) — subsequent `up` runs
don't need a re-scan. `./whatsap/devices/<name>/logs.txt` likewise accumulates every raw WhatsApp
event; both contain sensitive data (session credentials, message bodies) — treat them accordingly,
and don't commit them.

To run only `whatsap` without rebuilding/restarting the other services:

```bash
docker compose -f docker-compose-whatsap.yml up --build whatsap
```

To stop the stack:

```bash
docker compose -f docker-compose-whatsap.yml down
```

#### `whatsap` env vars

| Env var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — (required) | Anthropic API key, or a placeholder when `ANTHROPIC_BASE_URL` points at `llama-server` |
| `ANTHROPIC_MODEL` | — (required) | Model id, e.g. `claude-sonnet-5`, or a placeholder when using `llama-server` |
| `ANTHROPIC_BASE_URL` | unset (real Anthropic API) | Set to `http://llama-server:5050` (Docker) / `http://localhost:5050` (bare Node) to use the local model instead |
| `MAX_TOKENS` | unset (SDK default) | Caps every agent's response length (shared model instance) |
| `TAVILY_API_KEY` | — (required for `web_search`) | Backs the `web_search` tool used by several skills/agents |
| `STT_URL` | `http://localhost:8001` (`http://stt:8001` in Docker) | Whisper STT backend used to transcribe voice notes |
| `STT_ALLOWED_CHATS` | `@jlabrada71` | Comma-separated chat display names (as shown by `@ai list channels`) whose voice notes are auto-transcribed and forwarded to the default agent |
| `PLANTUML_URL` | `http://localhost:3000` (`http://plantuml-renderer:3000` in Docker) | Backend for the `render_diagram` tool |
| `SCHEDULER_POLL_INTERVAL_MS` | `60000` | How often the scheduler checks for due scheduled tasks |
| `DEVICE_ONBOARDING_POLL_INTERVAL_MS` | `5000` | How often the onboarding poller checks `new-devices/` for pending device requests |
| `INTERNAL_API_PORT` | `4001` | Port for `whatsap`'s internal API, used by `devices-ui` to list/create devices |

#### `devices-ui` env vars

| Env var (Docker / `NUXT_*`) | Env var (local `nuxt dev`) | Default | Purpose |
|---|---|---|---|
| `NUXT_WHATSAP_API_URL` | `WHATSAP_API_URL` | `http://localhost:4001` | Reaches `whatsap`'s internal API (Docker service DNS: `http://whatsap:4001`) |
| `NUXT_NEW_DEVICES_DIR` | `NEW_DEVICES_DIR` | `/data/new-devices` | Shared drop directory with `whatsap`'s onboarding poller — see `whatsap/device-onboarding.ts` |

#### `plantuml-renderer` env vars

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port the service listens on |
| `PLANTUML_TIMEOUT_MS` | `10000` | Max time allowed for a single render before it's aborted |
| `MAX_DIAGRAM_SIZE` | `1048576` | Max accepted diagram source size, in bytes |
| `MAX_CONCURRENT_RENDERS` | `2` | Caps concurrent PlantUML/Java invocations |

See `plantuml-renderer/README.md` for the full API reference and its security model (read-only
filesystem, dropped capabilities, no shell invocation).

#### `llama-server` env vars

| Env var | Default | Purpose |
|---|---|---|
| `CONTEXT_SIZE` | `40000` (hardcoded fallback in the start scripts) | `llama-server`'s `-c`/`--ctx-size` — total context window (prompt + output combined); raise with care, KV cache size scales with it |
| `MAX_TOKENS` | unset | Passed through as `-n` (max tokens generated per response) — shared with `whatsap`'s own `MAX_TOKENS` via the same `.env.whatsap-llama` |

Serves a Qwen3.5-4B GGUF at `model-qwen3.5/Qwen3.5-4B-UD-Q4_K_XL.gguf` (see the repo root
`README.md` for how to obtain it and build the matching `llama-server` binary) on port `5050`, an
OpenAI/Ollama-compatible API. `docker-compose-whatsap.yml` builds it from
`llama-server/Dockerfile.gpu` (needs the GPU `llama-gpu/` binary); the root `docker-compose.yml`
instead uses the CPU-only `llama-server/Dockerfile` (needs `llama/`).

## Persistent volumes

- **`./models`** — bind-mounted into `tts`, `stt`, and `qwen-stt` at `/models` (`HF_HOME=/models` in each
  Dockerfile). Holds downloaded Hugging Face model weights so they aren't re-fetched on every container
  restart. Safe to delete to force a clean re-download; do **not** delete while a service is starting up.
- **`./voices`** — bind-mounted into `tts` at `/voices`. Holds cloned-voice reference audio and metadata
  (`<voice_id>.audio` + `<voice_id>.json`). These are replayed automatically through the clone model on
  every `tts` startup — deleting a pair here permanently removes that cloned voice.
- **`./whatsap/devices`** — bind-mounted into `whatsap` at `/app/devices` (`docker-compose-whatsap.yml`).
  Holds every device's WhatsApp session (`<name>/session`), scheduled tasks (`<name>/tasks`), memory,
  and raw event log (`<name>/logs.txt`) — deleting a device's `session/` forces a QR re-scan; deleting
  the whole directory removes the device (and its scheduled tasks) entirely. Treat as sensitive.
- **`./whatsap/new-devices`** — bind-mounted into both `whatsap` (`/app/new-devices`) and `devices-ui`
  (`/data/new-devices`). A device request written here by `devices-ui`'s "Add Device" form is picked
  up by `whatsap`'s onboarding poller and turned into a running bot without a restart — see
  `whatsap/device-onboarding.ts`. Normally empty in steady state (pending files are deleted once
  onboarded).

## `text-to-speech` (Qwen3-TTS)

| Env var | Default | Purpose |
|---|---|---|
| `QWEN_TTS_CUSTOM_MODEL` | `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | Model used for the preset speakers. |
| `QWEN_TTS_BASE_MODEL` | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | Model used only for voice cloning. |
| `QWEN_TTS_DEVICE` | `cuda:0` (or `cpu` if no GPU) | Torch device for both models. |
| `QWEN_TTS_DTYPE` | `bfloat16` | One of `bfloat16`, `float16`, `float32`. |
| `QWEN_TTS_ATTN` | `sdpa` | Attention implementation, e.g. `flash_attention_2` if installed. |
| `QWEN_TTS_ENABLE_CLONE` | `true` (`false` in `docker-compose.yml`) | Set to `false` to skip loading the base/clone model entirely (saves ~half of `tts`'s VRAM). Disabled by default in this repo's `docker-compose.yml` to make room for `qwen-stt` — see the GPU memory budget above. |
| `QWEN_TTS_VOICES_DIR` | `/voices` | Where cloned-voice audio/metadata are persisted. |
| `HUGGING_FACE_HUB_TOKEN` | unset | Needed only for gated/private models; set via `HF_TOKEN` in your shell and uncomment the line in `docker-compose.yml`. |

## `whisper-speech-to-text` (Whisper large-v3-turbo)

| Env var | Default | Purpose |
|---|---|---|
| `WHISPER_MODEL` | `openai/whisper-large-v3-turbo` | Any `transformers`-compatible seq2seq ASR checkpoint. |
| `WHISPER_DEVICE` | `cuda:0` (or `cpu`) | Torch device. |
| `WHISPER_ATTN` | `sdpa` | Attention implementation, e.g. `flash_attention_2` if installed. |
| `WHISPER_CHUNK_LENGTH_S` | `30` | Chunking window (seconds) for long-form audio. |
| `WHISPER_BATCH_SIZE` | `8` | Batch size used by the `transformers` ASR pipeline. |

## `qwen-speech-to-text` (Qwen3-ASR)

| Env var | Default | Purpose |
|---|---|---|
| `QWEN_ASR_MODEL` | `Qwen/Qwen3-ASR-1.7B` | Model id passed to `Qwen3ASRModel.from_pretrained`. |
| `QWEN_ASR_DEVICE` | `cuda:0` (or `cpu`) | Torch `device_map`. |
| `QWEN_ASR_DTYPE` | `bfloat16` | One of `bfloat16`, `float16`, `float32`. |

## `ui` (Nuxt 3)

The UI never talks to the backend services directly from the browser; its Nitro server proxies
requests server-side. Configure the backend URLs it proxies to:

| Env var (Docker / `NUXT_*`) | Env var (local `nuxt dev`) | Default | Points at |
|---|---|---|---|
| `NUXT_TTS_URL` | `TTS_URL` | `http://localhost:8000` | `text-to-speech` |
| `NUXT_STT_URL` | `STT_URL` | `http://localhost:8001` | `whisper-speech-to-text` |
| `NUXT_QWEN_STT_URL` | `QWEN_STT_URL` | `http://localhost:8002` | `qwen-speech-to-text` |

In `docker-compose.yml` these are set to the service DNS names (`http://tts:8000`, `http://stt:8001`,
`http://qwen-stt:8002`). For local development outside Docker, set `TTS_URL`/`STT_URL`/`QWEN_STT_URL`
in your shell (or a `.env` file consumed by `nuxt dev`) if the backends aren't reachable on
`localhost` at their default ports.

## CPU-only builds

Every Python service's Dockerfile accepts a `TORCH_INDEX_URL` build arg to install CPU-only PyTorch
wheels instead of CUDA ones, for environments without an NVIDIA GPU:

```bash
docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu -t <tag> ./text-to-speech
docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu -t <tag> ./whisper-speech-to-text
docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu -t <tag> ./qwen-speech-to-text
```

If you build CPU-only images, also remove or comment out the `deploy.resources.reservations.devices`
block for that service in `docker-compose.yml` (it requests `nvidia` GPU devices and will fail to start
without an `nvidia-container-toolkit` runtime).

## `ai-extension`

### `ai-extension/server` (`.env`)

| Env var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — (required) | Anthropic API key for the chat agent |
| `ANTHROPIC_MODEL` | — (required) | Model id, e.g. `claude-sonnet-5` |
| `ANTHROPIC_BASE_URL` | unset (real Anthropic API) | Set to `http://localhost:5050` to point at the repo's local `llama-server` instead — same pattern as `whatsap/.env`. The Anthropic SDK reads this env var itself, so no code change is needed; pair it with placeholder `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` values (e.g. `not-necessary`) |
| `MAX_TOKENS` | unset (SDK default) | Caps the agent's response length; also caps `llama-server`'s own generation when pointed at it (its `-n` flag) |
| `TAVILY_API_KEY` | — (required for `web_search`) | Backs the agent's `web_search` tool. Not validated at startup — a missing key only surfaces as an error when the tool is actually called |
| `EXTENSION_ID` | — (required) | The loaded extension's Chrome ID — restricts CORS to `chrome-extension://<id>` |
| `PORT` | `4100` | HTTP port the server listens on |
| `MAX_CONTEXT_CHARS` | `20000` | Max characters of attached page/selection text sent to the agent per message; longer text is truncated with a note |

### Running `ai-extension/server` in Docker

`docker-compose-whatsap.yml` has an `ai-extension-server` service alongside `whatsap` and
`llama-server`, sharing the root `.env.whatsap-llama` file (so `ANTHROPIC_BASE_URL` is
already `http://llama-server:5050` — the Docker service DNS name, not `localhost`, since
containers don't share a loopback interface). `EXTENSION_ID`/`PORT`/`MAX_CONTEXT_CHARS` are
set directly in the compose file's `environment:` block instead of a `.env`. Start it with:

```bash
docker compose -f docker-compose-whatsap.yml up -d llama-server ai-extension-server
```

Published on `http://localhost:4100` on the host either way, so the extension's `fetch`
calls need no changes between the Docker and bare-Node setups.

### `ai-extension/extension`

`manifest.config.ts`'s `key` field pins the extension's ID across rebuilds — for unpacked
extensions Chrome derives the ID purely from this public key, no private key or signing
needed. The repo ships with a project-wide dev key already filled in, whose ID is always
`kbemgcmgfjcmpfhfcpfgfpanaommfgco` (matches the default `EXTENSION_ID` in
`ai-extension/server/.env.example`). To use your own instead:

```bash
openssl genrsa -out k.pem 2048
openssl rsa -in k.pem -pubout -outform DER | base64 -w0
```

Paste the output into `manifest.config.ts`'s `key` field, then update `EXTENSION_ID` in
`ai-extension/server/.env` to match (the ID is the first 16 bytes of the SHA-256 hash of the
DER public key, with each nibble mapped to a letter `a`–`p`).
