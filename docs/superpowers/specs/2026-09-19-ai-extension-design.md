# ai-extension: Chrome extension for chatting with an AI agent about web pages

Date: 2026-09-19
Status: Approved

## Purpose

A Chrome extension that lets the user chat with an AI agent about the page they're
browsing — e.g. "critically review this text" against a selection or the whole page.
The chat experience is modeled on `whatsap`'s agent (LangChain `createAgent` +
`ChatAnthropic`, with tools and a skill system), but runs as its own local backend
service the extension talks to, rather than reusing whatsap's WhatsApp-bound process.

## Scope

In scope: a new `ai-extension/` project (two sub-projects: `server/` and `extension/`)
inside the `whatsap-agent` repo, alongside the existing `whatsap/`, `ui/`, and the
Python voice services. Not in scope: changes to `whatsap/`, `ui/`, or the
docker-compose voice stack.

## Architecture

```
ai-extension/
  server/                  # Node/TS backend agent (LangChain, Express)
    agent.ts               # createAgent + ChatAnthropic, mirrors whatsap/agent.ts shape
    tools/                 # file/dir/bash tools (same pattern as whatsap/tools/*.tool.ts)
    middleware/             # skill-middleware, log-model-call-middleware
    skills/                 # curated skill packs for this agent (e.g. "critique-text")
    prompts/executer-system.md
    http.ts                # Express app: CORS + POST /api/chat, GET /health
    index.ts                # entrypoint
    package.json / .env.example / CLAUDE.md
  extension/                # Vue 3 + Vite + @crxjs/vite-plugin, MV3
    src/
      sidepanel/            # Vue app: App.vue, ChatView.vue, main.ts
      background/           # service worker: opens side panel, orchestrates page extraction
      content/               # injected on-demand via chrome.scripting (no persistent content script)
      components/, composables/
    manifest.config.ts
    vite.config.ts
    package.json
  docs/                     # ai-extension-specific ADRs/user-guides
```

### Backend (`server/`)

- Express server on port **4100** (repo already uses 8000/8001/8002/3000/5050).
- `POST /api/chat` — request `{ message: string, context?: { type: "selection"|"page", text: string, url: string }, threadId: string }`, response `{ reply: string }`.
- `threadId` is generated client-side per side-panel session (stored in
  `chrome.storage.session`) and reused across turns, feeding the agent's
  `MemorySaver` checkpointer the same way whatsap's `callAgent` uses a `thread_id`.
- `context.text`, when present, is prepended into the prompt sent to the agent,
  truncated to a configurable max length (long pages are clipped with an explicit
  note in the prompt, not silently dropped).
- **CORS**: the server only accepts requests whose `Origin` header matches
  `chrome-extension://<EXTENSION_ID>`, where `EXTENSION_ID` is set in
  `server/.env` after the unpacked extension is first loaded. The extension's
  `manifest.json` pins a `key` field so its ID is stable across reloads/rebuilds
  (documented in `docs/user-guides/config.md`).
- `tools/` and `skills/` follow the same shape as whatsap's (LangChain `tool()` +
  Zod schemas; skill-middleware progressive disclosure) but are this project's own
  independent copy — not imported from `whatsap/`. File/bash tools resolve paths
  against `ai-extension/server`'s own working directory, not the whole repo.
- System prompt (`prompts/executer-system.md`) is tailored to the "review/discuss
  page content" use case rather than whatsap's generic executor prompt.

**Risk carried forward from the design decision:** giving a browser-facing local
server bash/file tool access is a materially larger attack surface than a
chat-only agent. Mitigations: CORS restricted to the extension's own origin, and
the server only binds to localhost. This tradeoff was made explicitly in favor of
matching whatsap's tool/skill capabilities; revisit if the extension is ever
exposed beyond a single local user.

### Extension (`extension/`)

- Manifest V3. Permissions: `sidePanel`, `activeTab`, `scripting`, `storage`. No
  broad host permissions — page access only via `activeTab` plus on-demand
  `chrome.scripting.executeScript`, triggered by an explicit user action (button
  click), not a persistent content script.
- Side panel opens per-tab via the `chrome.sidePanel` API on toolbar-icon click.
- Two context actions in the chat UI:
  - **"Use selection"** — grabs `window.getSelection().toString()` from the active
    tab.
  - **"Use page"** — grabs `document.body.innerText` as a v1 baseline extraction.
    A Readability-style cleaner (to strip nav/ads/boilerplate) is a documented
    backlog item, not built in v1.
- Grabbed context renders as a dismissible chip above the chat input before
  sending, so the user sees and can remove what's about to be attached.
- Chat UI: message list + input, Vue 3 `<script setup>` + TypeScript, Tailwind for
  styling. The side panel is itself an extension page, so it calls
  `http://localhost:4100/api/chat` directly via `fetch` — no background-worker
  relay needed.
- Built with Vite + `@crxjs/vite-plugin` for MV3 manifest generation, HMR during
  dev, and bundling of the side panel, background service worker, and on-demand
  injected script.

### Data flow

1. User clicks the extension's toolbar icon → side panel opens for the active tab.
2. User optionally clicks "Use selection" or "Use page" → `chrome.scripting.executeScript`
   runs in the active tab, extracted text comes back to the side panel and renders
   as a context chip.
3. User types a message and sends → side panel `POST`s to
   `http://localhost:4100/api/chat` with `{ message, context, threadId }`.
4. Server runs the LangChain agent (with the attached context in the prompt),
   returns `{ reply }`.
5. Side panel appends the reply to the chat transcript.

## Testing

- `server/`: vitest unit tests for pure logic (context truncation, tool wrappers),
  following whatsap's `*.test.ts`-next-to-code convention.
- `extension/`: Vue Testing Library component tests for the chat UI, focused on
  accessibility (labeled input, button roles, a live region for new messages).
- Playwright script that launches Chrome with the unpacked extension loaded
  (persistent context), opens the side panel, sends a message, and asserts a
  reply renders — plus a page-context flow (select text → "Use selection" → send).

## Documentation

- `ai-extension/CLAUDE.md` documenting both sub-projects and how to run them
  together.
- ADR in `docs/architecture/adrs/` for the "independent copy vs. shared
  agent-core package" decision (chose independent copy: decouples whatsap and
  ai-extension release cycles at the cost of some duplicated tool/middleware code).
- Updates to repo-root `docs/user-guides/config.md` (new env vars: `EXTENSION_ID`,
  `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, port 4100), `features.md`, and
  `manual.md`.

## Explicitly out of scope / backlog

- Readability-style page-content cleaning (v1 uses raw `innerText`).
- Streaming responses (v1 returns the full reply in one response).
- Shared agent-core package between `whatsap` and `ai-extension` (deferred;
  revisit if the duplicated tool/middleware code becomes a maintenance burden).
- Auth token in addition to CORS origin check (deferred; CORS-only is judged
  sufficient for a single local user today).
