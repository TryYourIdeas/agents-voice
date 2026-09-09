# agents-voice

A self-hosted, GPU-backed voice AI stack: text-to-speech, two speech-to-text engines, a local
LLM server, and a Nuxt web UI tying them together. An optional, separate stack
(`docker-compose-whatsap.yml`) bridges a LangChain/Anthropic agent to WhatsApp.

## Architecture

| Service | Port | What it does |
|---|---|---|
| `tts` | 8000 | FastAPI service wrapping Qwen3-TTS (`text-to-speech/`) |
| `qwen-stt` | 8002 | FastAPI service wrapping Qwen3-ASR (`qwen-speech-to-text/`) |
| `stt` | 8001 | FastAPI service wrapping Whisper large-v3-turbo (`whisper-speech-to-text/`) — opt-in, see below |
| `ui` | 3000 | Nuxt 3 app — the browser frontend for all of the above (`ui/`) |
| `llama-server` | 5050 | Local OpenAI/Ollama-compatible inference server, from a prebuilt `llama.cpp` binary |

`llama-server` isn't wired into the `ui` today — it's there for local-model experimentation and
is what the optional `whatsap` stack can point its agent at instead of the real Anthropic API.

See `docs/user-guides/` for detail beyond this file: `config.md` (env vars, ports, GPU memory
budgeting), `features.md`, `manual.md` (UI walkthrough), and `api.md`/`api.yml` (endpoint
reference).

## Prerequisites

- Docker and Docker Compose
- An NVIDIA GPU with a recent driver, plus [`nvidia-container-toolkit`](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installed (`tts`/`stt`/`qwen-stt` request a GPU reservation in `docker-compose.yml`; CPU-only builds are possible per-service, see below)
- Enough disk space for model weights — the LLM GGUF alone is several GB, and each Python service downloads its own Hugging Face model into `./models` on first run

## 1. Clone and build llama.cpp

`llama-server` doesn't build `llama.cpp` from source itself — its Dockerfile just copies a
**prebuilt** `llama-server` binary out of a `llama/` (CPU) or `llama-gpu/` (GPU) directory at the
repo root. You build that binary once, outside Docker, and drop it into one of those directories.

Clone the source (kept as a sibling checkout, e.g. `llama.cpp/`, alongside this repo — it isn't a
git submodule here):

```bash
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
```

**CPU build** (feeds `llama/`, used by the root `docker-compose.yml`'s `llama-server` service via
`llama-server/Dockerfile`):

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j"$(nproc)"
```

**GPU build** (feeds `llama-gpu/`, used by `docker-compose-whatsap.yml`'s `llama-server` service
via `llama-server/Dockerfile.gpu` — needs the CUDA toolkit installed on the build machine):

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON
cmake --build build --config Release -j"$(nproc)"
```

Either build places its binaries under `build/bin/`. Copy them into the repo root as a **flat**
directory named `llama/` (CPU) or `llama-gpu/` (GPU) — both Dockerfiles expect
`<dir>/llama-server` directly, not nested under `bin/`:

```bash
# from inside llama.cpp/, after the CPU build:
mkdir -p ../llama && cp build/bin/* ../llama/

# after the GPU build instead:
mkdir -p ../llama-gpu && cp build/bin/* ../llama-gpu/
```

You only need whichever variant matches the stack you're running — the root `docker-compose.yml`
only needs `llama/`, `docker-compose-whatsap.yml` only needs `llama-gpu/`.

The GPU binary is dynamically linked against CUDA 13.x's `libcudart`/`libcublas`/`libcublasLt` —
`llama-server/Dockerfile.gpu` harvests matching `.so` files from an `nvidia/cuda` base image at
build time, so you don't need to install those system-wide, but the build machine does need a
matching CUDA toolkit to compile against.

## 2. Get the model weights

`llama-server` serves a Qwen3.5-4B GGUF quantization, expected at
`model-qwen3.5/Qwen3.5-4B-UD-Q4_K_XL.gguf` (see `start-llama-server.sh`/`start-llama-server-gpu.sh`
for the exact flags). Download it from
[unsloth/Qwen3.5-4B-GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF) on Hugging Face:

```bash
mkdir -p model-qwen3.5
# via the huggingface-cli, or download the file directly from the repo above
huggingface-cli download unsloth/Qwen3.5-4B-GGUF Qwen3.5-4B-UD-Q4_K_XL.gguf --local-dir model-qwen3.5
```

The other services (`tts`, `stt`, `qwen-stt`) don't need a manual download step — they pull their
own Hugging Face model on first run (`HF_HOME=/models`, bind-mounted to `./models`) and cache it
there for subsequent runs.

## 3. Run the main stack

```bash
docker compose up --build
```

Starts `tts`, `qwen-stt`, `llama-server`, and `ui`. `stt` (Whisper) is behind the `whisper`
Compose profile and not started by default — see `docs/user-guides/config.md`'s GPU memory budget
section for why, and how to switch to it.

Once up: UI at http://localhost:3000, TTS API at :8000, Qwen STT at :8002, Whisper STT (if
started) at :8001, `llama-server` at :5050.

## 4. Optional: the WhatsApp bot stack

`whatsap/` is a separate, self-contained project (its own `.git`, `package.json`,
`CLAUDE.md`/`README.md`) that bridges a LangChain agent to WhatsApp Web, with its own multi-device
support, scheduled tasks, and a device-linking web UI. It's not part of `docker-compose.yml` — run
it via its own compose file instead:

```bash
docker compose -f docker-compose-whatsap.yml up --build
```

This needs the **GPU** `llama-gpu/` build from step 1, plus a `.env.whatsap-llama` file at the repo
root (see `whatsap/.env.example` for the variable shapes — `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`,
`TAVILY_API_KEY`, etc.). First run needs an interactive terminal (or the device-linking UI at
:3003) to scan each device's WhatsApp Web QR code. See `whatsap/README.md` and `whatsap/CLAUDE.md`
for the full architecture and setup.

## CPU-only builds (no GPU)

Each Python service can be built without CUDA:

```bash
docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu -t <tag> ./text-to-speech
# or ./whisper-speech-to-text, ./qwen-speech-to-text
```

There's no CPU/GPU switch for `llama-server` at the Compose level — it's determined entirely by
which prebuilt binary directory (`llama/` vs `llama-gpu/`) and Dockerfile you point it at (see
step 1 above).
