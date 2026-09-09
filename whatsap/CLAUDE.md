# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A WhatsApp bot (via `whatsapp-web.js`) that forwards `@ai`-prefixed messages to a LangChain agent backed by Anthropic's Messages API (via `@langchain/anthropic`'s `ChatAnthropic`). There is no build step: dependencies are TypeScript files executed directly by Node's native TS support (this repo runs on Node v26).

## Commands

- Install deps: `pnpm install` (pnpm workspace, pinned to `pnpm@10.30.0`; `onlyBuiltDependencies: [puppeteer]` in `pnpm-workspace.yaml` since `whatsapp-web.js` drives Puppeteer)
- Run the actual bot (WhatsApp client + agent wiring): `node index.ts` — **not** `pnpm start`/`node coordinator.ts`; see "Standalone/experimental scripts" below.
- First run requires scanning a QR code (printed to terminal via `qrcode-terminal`) to authenticate the WhatsApp Web session.
- Requires `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` set (e.g. via `.env`, see `.env.example`) — `agent.ts` throws at import time if `ANTHROPIC_MODEL` is missing.
- Unit tests: `pnpm test` (`vitest run`) / `pnpm test:watch` (`vitest`, watch mode). `vitest.setup.ts` (registered via `vitest.config.ts`) defaults `ANTHROPIC_MODEL` to a placeholder so the suite doesn't require a real `.env` — needed because some pure-logic modules (e.g. `scheduler.ts`) transitively import `shared.ts`, which throws at import time if that var is unset. Tests live next to the code they cover, as `*.test.ts`.

## Development Conventions

- **Add automated unit tests (vitest) for new functionality.** New pure-logic modules (tools, `lib/*.ts` helpers, parsing/scheduling logic, etc.) should ship with a `*.test.ts` file alongside them, following the pattern in `lib/tasks.test.ts`, `middleware/frontmatter.test.ts`, and `scheduler.test.ts` — cover the success path plus the edge/error cases that matter (e.g. missing input, collision handling, not-found). Code that only makes sense against the live WhatsApp client or a real Anthropic call (e.g. `index.ts`'s message handlers) is verified by hand against the running containers instead, per this project's established practice — don't force a unit test where a real dependency can't be reasonably faked.

## Architecture

**Message flow:** `index.ts` is the real entrypoint. It imports the WhatsApp `client` and `start()`/`logToFile()` from `client.ts`, and `callAgent()` from `agent.ts`. It listens for `message`/`message_create` events, logs every raw event to `logs.txt`, replies `pong` to `!ping`, and for any message starting with `@ai` strips that prefix and dispatches on the remainder: `list channels` (case-insensitive) replies with the names of every chat the bot's `client.getChats()` currently returns (handled locally, no agent call), and anything else is passed to `callAgent()`, replying with the agent's final message.

**The agent (`agent.ts`):** built with `createAgent` (LangChain), using `ChatAnthropic` as the model, a `MemorySaver` checkpointer (conversation memory keyed by `thread_id`, currently hardcoded to `"user-session-123"` in `callAgent`'s default), and a system prompt loaded from `prompts/executer-system.md`. Tools wired in: read/write file, list/check/create directory, execute bash. Two middlewares are attached:
- `middleware/skill-middleware.ts` — a progressive-disclosure "skills" system for the *agent itself* (distinct from Claude Code's own Skill tool). At load time it scans every subdirectory of `./skills/` for a `SKILL.md`, parses the `name`/`description` out of its frontmatter, and injects a `## Available Skills` list into the system prompt. It also exposes a `load_skill` tool the agent can call to pull a skill's full body into context on demand.
- `middleware/log-model-call-middleware.ts` — logs before/after every model call to the console.

**`prompts/executer-system.md`** is the system prompt driving agent behavior — currently a minimal generic "plan then execute with available tools" placeholder. It previously defined an Arduino-code-generation workflow, now removed; the plan is to replace the placeholder with instructions once dedicated API-access tools are added.

**`tools/*.tool.ts`:** LangChain `tool()` wrappers with Zod schemas. File/directory tools resolve paths by joining the given `file_path` against `process.cwd()`. `execute-bash.tool.ts` shells out via `child_process.exec` with no sandboxing.

**Standalone/experimental scripts not wired into `index.ts`:**
- `client.ts` — the WhatsApp client setup (`Client`, `LocalAuth`, QR login, `logToFile`) that `index.ts` actually imports and uses.
- `coordinator.ts` — a self-contained duplicate of the raw WhatsApp client + message handlers (no agent wiring); this is what `pnpm start` currently runs, but it's not the file that integrates the AI agent.
- `deep-researcher.ts` — a separate one-shot script using `deepagents`' `createDeepAgent` with a `webSearch` tool, driven by the instructions in `research-topic.md`, writing findings out to a `deep-agents.md` file. Still uses `ChatOllama` directly — not part of the Anthropic migration.
- `example.js` — a large (~90KB) generated/bundled file; not meant to be hand-edited.

**`skills/`** holds skill packs (`SKILL.md` + supporting `scripts`/`references`) consumed by `skillMiddleware`, e.g. `git-tasks`, `topic-research`, `vite-unit-tests`, `effective-prompt-writing`, `skill-generator`. These are content for the LangChain agent's own skill system, not Claude Code skills.

**Scheduled tasks (`tasks/`, `scheduler.ts`, `lib/tasks.ts`):** one-off or
recurring tasks that run an agent on a schedule and deliver the result to a
WhatsApp chat. Each active task is a file under `tasks/` (frontmatter +
body, same convention as `agent.md`/`SKILL.md`, parsed with
`middleware/frontmatter.ts`); `tasks/index.md` and `tasks/archive/index.md`
are regenerated display listings, not a second source of truth.
`scheduler.ts` polls `tasks/` every `SCHEDULER_POLL_INTERVAL_MS` (default
60s, started from `index.ts` once the WhatsApp client is ready) and fires
anything due, using `cron-parser` for recurring schedules. A dedicated
`task-scheduler` named agent (`agents/task-scheduler/agent.md`, using the
`cron-scheduling` skill) owns task creation via three tools
(`create_scheduled_task`/`list_scheduled_tasks`/`cancel_scheduled_task`) and
is responsible for validating task details and asking clarifying questions
rather than guessing — see
`docs/superpowers/specs/2026-09-07-scheduled-task-execution-design.md` for
the full design. Reachable via `@ai schedule <text>`, `@ai list tasks`,
`@ai cancel task <name>`, or natural chat delegation through
`middleware/agent-delegation-middleware.ts`.

**`session/`** holds `whatsapp-web.js` `LocalAuth` session state (authenticated WhatsApp Web credentials) — treat as sensitive, do not print or transmit its contents.

**`logs.txt` / `logs.01.txt` / `logs.02.txt`** are append-only dumps of every raw WhatsApp event (via `logToFile`), including message bodies and sender metadata — treat as containing user data.

## Known issues

`tools/web-search.tool.ts` previously had a Tavily API key hardcoded in plaintext; it's now read from `TAVILY_API_KEY` in `.env` (see `.env.example`). The key value itself was exposed in the source for a period and should still be rotated in the Tavily dashboard.
