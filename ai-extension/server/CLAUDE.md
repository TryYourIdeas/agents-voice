# CLAUDE.md

Guidance for Claude Code when working in `ai-extension/server`.

## What this is

A local Express HTTP server wrapping a LangChain `createAgent` + `ChatAnthropic` agent —
the backend for the `ai-extension` Chrome extension's side-panel chat. Same agent shape as
`whatsap/agent.ts` (file/directory/bash tools, skill-middleware, `MemorySaver` checkpointer)
but its own independent instance — see
`docs/superpowers/specs/2026-09-19-ai-extension-design.md` for why.

## Commands

- Install: `pnpm install`
- Run: `node index.ts` (no build step, Node native TS execution)
- Test: `pnpm test` (`vitest run`) / `pnpm test:watch`
- Requires `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and `EXTENSION_ID` set (see `.env.example`)
  — `index.ts` throws at startup if `EXTENSION_ID` is missing, `agent.ts` throws if
  `ANTHROPIC_MODEL` is missing.
- **No real Anthropic API key needed for local dev** — same pattern as `whatsap/.env`: set
  `ANTHROPIC_BASE_URL=http://localhost:5050` (the repo's local `llama-server`) plus
  placeholder `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` values (e.g. `not-necessary`); the
  Anthropic SDK reads `ANTHROPIC_BASE_URL` from the environment on its own, so `agent.ts`
  needs no code change to point at it instead of the real API. See `.env.example`.
- **Docker**: `Dockerfile` builds this service for `docker-compose-whatsap.yml`'s
  `ai-extension-server`, which shares `.env.whatsap-llama` with `whatsap`/`llama-server` (so
  `ANTHROPIC_BASE_URL` there is already `http://llama-server:5050`, the Docker service DNS
  name — not `localhost`, since containers don't share a loopback). Run:
  `docker compose -f docker-compose-whatsap.yml up -d llama-server ai-extension-server`.

## Architecture

- `agent.ts` — the LangChain agent: `ChatAnthropic` model, file/directory/bash tools,
  `skillMiddleware`, `logModelCallMiddleware`, `MemorySaver` checkpointer keyed by the
  `threadId` the extension sends.
- `context.ts` — formats/truncates page-selection or full-page-text context (from the
  extension) into the block prepended to the user's message.
- `http.ts` — `createApp()` builds the Express app: CORS restricted to
  `chrome-extension://<EXTENSION_ID>`, `GET /health`, `POST /api/chat`.
- `tools/*.tool.ts` — LangChain tools, paths resolved against this server's own working
  directory (not the whole repo).
- `middleware/skill-middleware.ts` + `skills/*/SKILL.md` — progressive-disclosure skill
  system, same pattern as whatsap's own (own copy, not shared).

## Security note

This server has file/bash tool access and is reachable over localhost HTTP. It is guarded
only by the `Origin` CORS check (no auth token) — acceptable for a single local user, per
the design spec's explicit risk tradeoff. Do not expose this port beyond localhost.
