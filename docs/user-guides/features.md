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
- **Web search** — the agent can search the web (Tavily-backed `web_search` tool) to
  answer questions that need current information, not just what's on the page.
- Chat replies render as Markdown (headings, lists, code, links, etc.), not plain text.

## WhatsApp bot (`whatsap`)

A WhatsApp bot (via `whatsapp-web.js`) that forwards `@ai`-prefixed chat messages to a LangChain
agent backed by Anthropic's Messages API (or the local `llama-server`, see `config.md`).

- **Multi-device** — link more than one WhatsApp account/phone to the bot at once, each with its
  own independent session, conversation memory, and scheduled tasks. Add a device via the terminal
  QR code or the [`devices-ui` web UI](#device-management-ui-devices-ui).
- **Chat commands** (send any of these, prefixed with `@ai`, to a chat the linked account can see):
  - `@ai help` — list available commands.
  - `@ai <message>` — talk to the default agent.
  - `@ai @agent <agent name> [message]` — talk to a named agent instead (see below).
  - `@ai list agents` — list available named agents.
  - `@ai list channels` — list every chat the bot can see, by display name.
  - `@ai clear session` — forget this chat's conversation with every agent.
  - `@ai schedule <describe task and timing>` — create a one-off or recurring scheduled task.
  - `@ai list tasks` / `@ai cancel task <name>` — manage scheduled tasks.
  - `!ping` — health check, replies `pong`.
  - Any `@ai` message can include an attached or quoted image, or a voice note — the agent sees
    the image or hears the transcribed audio.
- **Auto-transcribed voice notes** — voice notes sent to allow-listed chats (`STT_ALLOWED_CHATS`)
  are transcribed (Whisper) and forwarded to the default agent automatically, no `@ai` prefix needed.
- **Named agents** (`@ai @agent <name> ...`) — specialized personas with their own system prompt,
  tools, and skills:
  - `math-coach` — Socratic math tutor (guides toward the answer instead of stating it).
  - `story-coach` — storytelling coach for practicing/improving personal stories.
  - `system-design-coach` — plays interviewer for system design practice, with diagrams
    (via `plantuml-renderer`) and structured feedback.
  - `critical-thinking-analyst` — fact-checks claims, evaluates argument structure, flags
    logical fallacies and rhetorical strategies in a piece of text.
  - `task-scheduler` — creates/lists/cancels scheduled tasks (what `@ai schedule` delegates to).
- **Skills** — a progressive-disclosure system (distinct from Claude Code's own skills) that
  injects a list of available skills into an agent's system prompt and lets it load a skill's
  full instructions on demand: `git-tasks`, `topic-research`, `effective-prompt-writing`,
  `vite-unit-tests`, `cron-scheduling`, `logical-fallacies`, `argumentation-strategies`,
  `argument-analysis`, `skill-creator` (for authoring new skills).
- **Scheduled tasks** — one-off or recurring (cron) tasks that run an agent later and deliver the
  result back to the originating WhatsApp chat.
- **Tools available to agents** — read/write/list files, execute bash, download a file, fetch a
  URL, web search (Tavily), render a PlantUML diagram, plus the scheduling tools above.

## Device management UI (`devices-ui`)

A small Nuxt web UI (`http://localhost:3003`) for managing `whatsap`'s linked devices without
needing a terminal:

- **List devices** — name, label, and live connection status (`pending` / `connected` /
  `disconnected`).
- **Add a device** — name (lowercase letters/numbers/dashes) + a display label; creates a pending
  device request picked up by `whatsap`'s onboarding poller with no restart needed.
- **QR pairing page** — shows the device's live QR code (refreshable) until it's scanned, then
  flips to a "Connected" state automatically (polls status every 2 seconds). If the QR isn't
  scanned within about a minute, the device gives up and flips to "Disconnected" instead of
  sitting on a stale code indefinitely.
- **Reconnect button** — on a disconnected device, one click either reconnects silently (if its
  session is still valid) or shows a fresh QR code to re-scan.

## Local LLM server (`llama-server`)

A local, OpenAI/Ollama-compatible inference server (`llama.cpp`, serving a Qwen3.5-4B GGUF) that
`whatsap` and `ai-extension/server` can point at instead of the real Anthropic API — useful for
running the WhatsApp bot or the browser extension entirely offline/free, at the cost of a smaller,
weaker model. Not wired into the main voice-AI `ui`.

## Diagram rendering (`plantuml-renderer`)

A small internal HTTP service that renders PlantUML diagram source to SVG/PNG, used by the
`system-design-coach` named agent's `render_diagram` tool so it can produce architecture/sequence
diagrams as part of its feedback. Runs with a read-only filesystem, dropped capabilities, and no
shell invocation (see `plantuml-renderer/README.md`).
