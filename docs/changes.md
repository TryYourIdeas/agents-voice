# Changes

## 2026-10-31 — Date awareness and the AI-news search loop

- `whatsap`: the daily "AI news" scheduled task looped on `web_search` until the recursion limit
  (Oct 30 and 31) and produced nothing after 2026-09-24. Cause: the agent had no clock, and its
  task-memory note was a dated narrative of the Sep 24 run, so it kept re-verifying those stories.
- New `get_current_datetime` tool and `datetimeMiddleware` (stamps every model call with today's date,
  time and timezone); timezone from `AGENT_TIMEZONE` (then `TZ`, then the system zone).
- Recurring-task prompts now state today's date and tell the agent notes are not today's facts.
- `web_search` answers an identical repeated query (same thread) with a nudge instead of searching again.
- The scheduler no longer counts a recursion-limit run as successful: it retries once after 10 min, then
  tells the chat and waits for the next schedule.
- Follow-up from the Nov 1 run (date fix worked, but it still hit the limit): attempt 1 saved everything
  then kept re-verifying; the blind retries re-read and re-fetched dead URLs. Retries now carry a resume
  note, the prompt says to skip failed (403/404) pages and stop once files are saved, "new since
  <timestamp>" became "published in the last 24 hours", scheduled runs get `SCHEDULED_RECURSION_LIMIT`
  (default 2x chat limit), and the lfm3 compose files set `AGENT_TIMEZONE`.

## 2026-10-30 — Path consistency and reply routing

- `whatsap`: `execute_bash` now runs in the device folder (same root as the file tools), the file
  tools accept the full `devices/<device>/…` form instead of doubling the prefix, and the system prompt
  states the convention. Two agent loops (recursion limit hit) came from the tools disagreeing about
  where relative paths start.
- `whatsap`: replies to a message written by a named agent (scheduled `target-agent`, `@ai @agent`,
  task-scheduler) are routed back to that agent via `lib/message-owners.ts`; before, the default agent
  got them without the context. The default agent is also told how to treat replies.

## 2026-10-29 — Separate text and vision models (LFM3 vision stack)

- `whatsap-lfm3-stt-tts-vision-docker-compose.yml`: `llama-server` now serves LFM3-1.7B for text;
  new `llama-server-vision` serves LFM3-VL-2B for image turns. `whatsap` routes per model call via
  `lib/vision-routing.ts` (`VISION_BASE_URL`), stripping old images for the text model. Other
  stacks are unchanged.

## 2026-10-29 — On-demand `send_audio` tool

- `whatsap`: new `send_audio` agent tool that voices text from the conversation (a summary, a
  story) with the TTS service and sends it to the current chat as a voice note, only when the user
  asks. Reuses `sendVoiceReply`, so the echo guard applies. Chat resolution from the thread id was
  extracted into `lib/thread-chat.ts` (also used by `get_current_chat`).
- `whatsap`: an `@ai` reply to a message now includes that message's text (or the caption of a
  quoted image/video) in what the agent receives (`lib/quoted-text.ts`); before, only quoted media
  was forwarded, so "@ai make an audio of this" gave the agent nothing to read.

## 2026-10-13 — Fix Whisper `stt` crash-loop and `whatsap` devices dying on Chromium launch timeout

- `whisper-speech-to-text`: `transformers>=4.45` resolved to 5.x on rebuild, which calls
  `torch.accelerator` (absent in the pinned torch 2.5.1), so the service crash-looped on import.
  Pinned `transformers<5`.
- `whatsap`: with all devices launching Chromium at once, puppeteer's 30s launch timeout was
  exceeded, leaving `client.pupPage` null and the scheduler throwing
  `Cannot read properties of null (reading 'evaluate')` every minute. Raised the launch timeout,
  added `--disable-dev-shm-usage` and `shm_size: 1gb`, retry a failed `initialize()` up to 3 times
  (15s apart), and made the scheduler skip devices whose browser isn't up.

## 2026-09-24 — Add a Reconnect button and a QR-scan timeout to `devices-ui`

A disconnected device previously had no way to recover short of restarting the whole `whatsap`
container — added a **Reconnect** button (`devices-ui`'s device page → `POST
/api/devices/:name/reconnect` → `whatsap`'s new internal-API route → `bot.ts`'s new
`reconnectDevice`, which tears down the old client and starts a fresh one against the same
on-disk session). Also, a device sitting on an unscanned QR code no longer stays `pending`
forever: `bot.ts` now starts a one-time 60s timer on the first `qr` event per connection
attempt and flips the device to `disconnected` if it's still pending when that timer fires.

While wiring this up, found that `whatsap/.gitignore`'s unanchored `devices` pattern was
matching *any* directory named `devices` anywhere in the tree, not just the intended
`whatsap/devices/` runtime data — it had been silently excluding `devices-ui`'s own
`pages/devices/` and `server/api/devices/` subtrees from git the whole time (the "Add
Device"/QR-pairing UI and its `qr.png` API route existed only on disk, never committed).
Anchored it to `/devices` and committed the previously-untracked files.

## 2026-09-24 — Document `whatsap`, `devices-ui`, `llama-server`, and `plantuml-renderer` in the user guides

`docs/user-guides/config.md`, `features.md`, and `manual.md` covered the voice-AI stack
(`tts`/`stt`/`qwen-stt`/`ui`) and `ai-extension` well but were missing the `whatsap` WhatsApp bot
itself (chat commands, named agents, skills, scheduled tasks, voice-note auto-transcription),
the `devices-ui` device-management web UI, `llama-server`'s config, and `plantuml-renderer`.
Extended all three docs with that coverage instead of creating new files, to avoid duplicating
the existing WhatsApp-bot section already in `config.md`. Also filled in `MAX_TOKENS`/
`TAVILY_API_KEY`, which `ai-extension/server`'s config table was missing, and noted the
`web_search` tool and Markdown-rendered replies already shipped in `ai-extension`.

## 2026-09-24 — Fix `docker-compose-whatsap.yml` crash-loop on `whatsap`/`ai-extension-server`

Both services crashed on startup with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` when
importing `langchain-agent-kit`. Root cause: pnpm's `file:` protocol packs the dependency's
directory into `node_modules` (copy, not a live symlink to `lib/langchain-agent-kit`), so its
raw `.ts` source physically lives under `node_modules` — and Node's native TypeScript
type-stripping refuses to strip types for anything there, with no override flag. Fixed by
giving `lib/langchain-agent-kit` a `build` script (`tsc -p tsconfig.build.json`) that compiles
`src/*.ts` to `dist/*.js`, pointing `package.json`'s `exports`/`types` at `dist`, and building
it in both `whatsap/Dockerfile` and `ai-extension/server/Dockerfile` (via `npm --prefix
/lib/langchain-agent-kit install --include=dev && npm --prefix /lib/langchain-agent-kit run
build`, before the consumer's own `pnpm install`) so the packed dependency only ever contains
compiled JS. Also added `lib/langchain-agent-kit/.npmignore` (just `node_modules`) — pnpm's
local-path packing follows `.gitignore`/`.npmignore` rather than `package.json`'s `files`
field, so `dist` being in `.gitignore` (for git purposes) was otherwise excluding it from the
pack too.

## 2026-09-22 — Extract langchain-agent-kit shared package

`whatsap/` and `ai-extension/server/` each ran their own copy of frontmatter parsing, the
skills progressive-disclosure middleware, and model-call logging — copies that had drifted
(`whatsap`'s skill-middleware gained multi-agent `extraDirs`/`allowedSkills` support that
`ai-extension`'s never got). Extracted all three into `lib/langchain-agent-kit/`, a shared
TypeScript package consumed via a `file:` dependency by both. No behavior change to either
agent. See `docs/superpowers/specs/2026-09-22-langchain-agent-kit-extraction-design.md`.

File/directory/bash tools remain project-specific for now (deferred to a follow-up PR —
they take different shapes between the two agents).
