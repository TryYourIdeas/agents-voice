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

## Running it locally

1. `cd ai-extension/server && pnpm install && cp .env.example .env` — fill in
   `ANTHROPIC_API_KEY`.
2. `cd ai-extension/extension && npm install && npm run build`.
3. Load `ai-extension/extension/dist` as an unpacked extension in `chrome://extensions`
   (Developer mode on).
4. Copy the extension's ID from `chrome://extensions` into `ai-extension/server/.env`'s
   `EXTENSION_ID`.
5. `cd ai-extension/server && node index.ts`.
6. Click the extension's toolbar icon to open the side panel and chat.

## Commands

- Server tests: `cd ai-extension/server && pnpm test`
- Extension unit/component tests: `cd ai-extension/extension && npm test`
- Extension E2E tests: `cd ai-extension/extension && npm run test:e2e` (requires the server
  running and the extension built, per "Running it locally" above)
