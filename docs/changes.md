# Changes

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
