# CLAUDE.md

Guidance for Claude Code when working in `ai-extension/`.

## What this is

A Chrome (MV3) extension for chatting with an AI agent about the page you're browsing —
select text or grab the whole page and ask the agent to review, critique, or discuss it.
Two independent sub-projects:

- `server/` — a local Node/TypeScript Express server wrapping a LangChain agent (see
  `server/CLAUDE.md`).
- `extension/` — a Vue 3 + Vite (`@crxjs/vite-plugin`) MV3 extension with a side-panel chat
  UI (see the design spec below for the full architecture).

Design spec: `docs/superpowers/specs/2026-09-19-ai-extension-design.md`.

## Running the server: Docker (recommended) or bare Node

### Docker — via `docker-compose-whatsap.yml`

`ai-extension-server` is wired into the repo root's `docker-compose-whatsap.yml` alongside
`whatsap` and `llama-server`, sharing the same `.env.whatsap-llama` file — no real Anthropic
API key needed:

```bash
docker compose -f docker-compose-whatsap.yml up -d llama-server ai-extension-server
```

This publishes the server on `http://localhost:4100` (same as bare-Node below) and routes
its Anthropic-SDK calls to `llama-server:5050` over the Docker network. `EXTENSION_ID`
defaults in the compose file to `kbemgcmgfjcmpfhfcpfgfpanaommfgco`, matching
`ai-extension/extension/manifest.config.ts`'s pinned dev key.

### Bare Node (no Docker)

1. `cd ai-extension/server && pnpm install && cp .env.example .env` — either fill in a real
   `ANTHROPIC_API_KEY`, or, to avoid needing one, point at the repo's local `llama-server`
   the same way `whatsap/.env` does (uncomment the `ANTHROPIC_BASE_URL=http://localhost:5050`
   block in `.env.example` — start `llama-server` first, see the repo root README).
2. `cd ai-extension/server && node index.ts`.

## Loading the extension

1. `cd ai-extension/extension && npm install && npm run build`.
2. Load `ai-extension/extension/dist` as an unpacked extension in `chrome://extensions`
   (Developer mode on). The extension's `manifest.config.ts` pins a dev `key`, so its ID is
   always `kbemgcmgfjcmpfhfcpfgfpanaommfgco` — no need to look it up after loading, and it
   already matches the server's default `EXTENSION_ID` above (Docker or bare-Node).
3. Click the extension's toolbar icon to open the side panel and chat.

## Commands

- Server tests: `cd ai-extension/server && pnpm test`
- Extension unit/component tests: `cd ai-extension/extension && npm test`
- Extension E2E tests: `cd ai-extension/extension && npm run test:e2e` (requires the server
  running — Docker or bare-Node — and the extension built, per above)
- Server Docker image: `docker compose -f docker-compose-whatsap.yml build ai-extension-server`
