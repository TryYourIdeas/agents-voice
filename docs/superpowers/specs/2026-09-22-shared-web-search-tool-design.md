# Shared web-search tool for ai-extension/server (via langchain-agent-kit)

## Context

`ai-extension/server`'s `critique-text` skill (`skills/critique-text/SKILL.md`) advertises
"fact-check" as something it handles, but the agent has no web-search tool — it can only
evaluate a claim's internal consistency against its own training data, not verify it against
a current source. `whatsap` already has a working Tavily-backed `web_search` tool
(`tools/web-search.tool.ts`), so this closes the gap by sharing that capability through
`lib/langchain-agent-kit/` (the shared package created in
`docs/superpowers/specs/2026-09-22-langchain-agent-kit-extraction-design.md`) rather than
duplicating it.

`whatsap`'s current tool isn't a clean drop-in: it interleaves the actual Tavily call with
two `whatsap`-only concerns — a `searchCount`/`searchCountBase` in-memory counter, and
writing every search's query + results to a **device-scoped** `research/` directory via
`resolveDeviceScopedPath(config, "research")` (`lib/device-scoped-path.ts`, a multi-device
concept `ai-extension/server` has no equivalent of — it's a single-instance agent). This
spec separates the reusable core (schema, defaults, the Tavily call itself) from that
project-specific persistence behavior.

## Goals

- `ai-extension/server`'s agent gains a working `web_search` tool.
- The Tavily-calling logic (schema, defaults, the actual API call) is implemented once, in
  `lib/langchain-agent-kit/`, not duplicated.
- `whatsap`'s existing behavior (device-scoped result persistence, its counter-based
  filenames) is fully preserved — this is a refactor of `whatsap`'s tool, not a behavior
  change.
- `ai-extension/server`'s `critique-text` skill instructs the agent to actually use
  `web_search` to verify factual claims, so its "fact-check" claim is accurate.

## Non-goals

- Changing `whatsap`'s research file format, directory layout, or counter scheme.
- Adding any result caching, rate limiting, or search-provider abstraction beyond Tavily.
- Adding startup-time validation for `TAVILY_API_KEY` — matching the existing tool's
  behavior, a missing key surfaces as a runtime error only when the tool is actually invoked
  (`TavilySearch` reads `process.env.TAVILY_API_KEY` inside the call, not at import time).

## Design

### `lib/langchain-agent-kit/src/web-search.ts`

```ts
export type WebSearchTopic = "general" | "news" | "finance";

export interface WebSearchArgs {
    query: string;
    maxResults: number;
    topic: WebSearchTopic;
    includeRawContent: boolean;
}

export function createWebSearchTool(opts?: {
    // Called after a successful Tavily call, given the resolved args, the raw
    // Tavily response, and the LangChain RunnableConfig the tool was invoked
    // with (so a caller needing device/session-scoped behavior — e.g.
    // whatsap's resolveDeviceScopedPath — can read whatever it needs off
    // config without this module knowing what a "device" is).
    onResult?: (args: WebSearchArgs, result: unknown, config: unknown) => void | Promise<void>;
})
```

Internals: same Zod schema and defaults as `whatsap`'s current tool
(`maxResults` default 5, `topic` default `"general"`, `includeRawContent` default `false`),
same `TavilySearch` construction and `._call({ query })` invocation. After the call succeeds,
if `opts?.onResult` is given, it's awaited with `(args, result, config)` before the tool
returns `result` to the agent. No `onResult` (the `ai-extension/server` case) means the
result is simply returned — nothing persisted, nothing logged beyond what `whatsap`'s
current bare `console.log` calls already do (kept as-is inside the shared function, since
that logging isn't project-specific).

Adds `@langchain/tavily` (`^1.2.0`, matching `whatsap`'s current pin) as a kit dependency.

### `whatsap/tools/web-search.tool.ts`

Shrinks to:
```ts
import { createWebSearchTool } from "langchain-agent-kit";
import fs from "node:fs";
import path from "node:path";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

let searchCountBase = new Date().getTime();
let searchCount = 0;

export const webSearch = createWebSearchTool({
    onResult: (args, result, config) => {
        searchCount++;
        const researchDir = resolveDeviceScopedPath(config, "research");
        fs.mkdirSync(researchDir, { recursive: true });
        const resultFileName = `${searchCountBase}_${searchCount}_results.json`;
        fs.writeFileSync(path.join(researchDir, resultFileName), JSON.stringify(result, null, 2));
        const queryFileName = `${searchCountBase}_${searchCount}_query.json`;
        fs.writeFileSync(path.join(researchDir, queryFileName), JSON.stringify({ query: args.query, topic: args.topic }, null, 2));
    },
});
```
Every filename and the persisted JSON shapes stay byte-for-byte identical to today's
behavior — this is checked by hand against the current implementation during review, since
`whatsap` has no existing test for this tool to diff against automatically.

The dead "you'll need to install tavily-js" comment and the `@ts-ignore` on the `._call`
line are re-evaluated against the kit's pinned `@langchain/tavily` version while moving this
code — dropped if the type error no longer reproduces, kept (with an explanation of what
the error actually is) if it does.

### `ai-extension/server/tools/web-search.tool.ts`

```ts
import { createWebSearchTool } from "langchain-agent-kit";

export const webSearchTool = createWebSearchTool();
```

Wired into `agent.ts`'s tool list alongside the existing file/directory/bash tools.

### `ai-extension/server` env and docs

- `.env.example`: add `TAVILY_API_KEY=` with a comment noting it's required for the
  `web_search` tool and is already present in the shared `.env.whatsap-llama` Docker uses
  (no `docker-compose-whatsap.yml` change needed — `ai-extension-server` already loads that
  same env file).
- `CLAUDE.md`: add `web_search` to the tool list in "What this is" / "Architecture", and note
  the `TAVILY_API_KEY` requirement next to the existing `ANTHROPIC_*`/`EXTENSION_ID` ones.

### `skills/critique-text/SKILL.md`

Add a step instructing the agent to use `web_search` to check specific factual claims
(dates, statistics, named sources) against current results before rendering a verdict, when
the text makes claims that are checkable and material to the critique — not a blanket
"always search" (most stylistic/argument-structure critique needs no lookup). Keep
"fact-check" in the description, since it's now backed by an actual capability.

### Testing

New tests in `lib/langchain-agent-kit/src/web-search.test.ts`, mocking `@langchain/tavily`'s
`TavilySearch` (its `_call` method), covering:
- default args are applied when omitted.
- the tool's return value is the raw Tavily response.
- `onResult` is called with `(args, result, config)` when provided.
- omitting `onResult` doesn't throw and still returns the result.

`whatsap`'s and `ai-extension/server`'s own test suites (`pnpm test`) must still pass
unchanged after wiring — this is the regression check for `whatsap`'s refactor, alongside
manual verification that persisted file contents/paths haven't changed.

## Rollout

Single PR. No Docker build-context changes needed beyond what PR 1 already did (both
services already build from the repo root and can see `lib/`). No new env var needed in
`docker-compose-whatsap.yml` (`TAVILY_API_KEY` already flows to `ai-extension-server` via
the shared `.env.whatsap-llama`).
