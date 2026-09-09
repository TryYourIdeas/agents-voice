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
runs just it plus `llama-server`, without building or starting `tts`/`stt`/`qwen-stt`/`ui`:

```bash
docker compose -f docker-compose-whatsap.yml up --build
```

It declares its own Compose project (`name: agents-voice-whatsap`), so it won't collide with containers
from the default `docker-compose.yml`.

**Environment:** the `whatsap` service loads `.env.whatsap-llama` (repo root, next to the compose file)
via `env_file` — set `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`, and `TAVILY_API_KEY`
there. It's `.gitignore`-worthy (contains secrets) and not committed; create it yourself before first run.

**First run needs an interactive terminal** to scan the WhatsApp Web QR code (printed via
`qrcode-terminal`):

```bash
docker compose -f docker-compose-whatsap.yml up --build
# watch the foreground logs for the QR code, scan it with WhatsApp
# (Linked Devices) on your phone
```

Once authenticated, the session persists in `./whatsap/session` (bind-mounted into the container) —
subsequent `up` runs don't need a re-scan. `./whatsap/logs.txt` is likewise bind-mounted and accumulates
every raw WhatsApp event; both contain sensitive data (session credentials, message bodies) — treat
them accordingly, and don't commit them.

To run only `whatsap` without rebuilding/restarting `llama-server`:

```bash
docker compose -f docker-compose-whatsap.yml up --build whatsap
```

To stop the stack:

```bash
docker compose -f docker-compose-whatsap.yml down
```

## Persistent volumes

- **`./models`** — bind-mounted into `tts`, `stt`, and `qwen-stt` at `/models` (`HF_HOME=/models` in each
  Dockerfile). Holds downloaded Hugging Face model weights so they aren't re-fetched on every container
  restart. Safe to delete to force a clean re-download; do **not** delete while a service is starting up.
- **`./voices`** — bind-mounted into `tts` at `/voices`. Holds cloned-voice reference audio and metadata
  (`<voice_id>.audio` + `<voice_id>.json`). These are replayed automatically through the clone model on
  every `tts` startup — deleting a pair here permanently removes that cloned voice.

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
