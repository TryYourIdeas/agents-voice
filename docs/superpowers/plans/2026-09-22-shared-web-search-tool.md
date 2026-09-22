# Shared web-search tool for ai-extension/server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ai-extension/server`'s agent a working `web_search` tool by extracting the reusable core of `whatsap`'s existing Tavily-backed tool into `lib/langchain-agent-kit/`, and update the `critique-text` skill so its "fact-check" claim is backed by an actual capability.

**Architecture:** A new `createWebSearchTool(opts?)` factory in the kit wraps the Tavily call, schema, and defaults (identical behavior to `whatsap`'s current tool). It takes an optional `onResult` callback invoked after a successful search, given the args, the raw result, and the tool's `RunnableConfig` — `whatsap` uses this to keep its device-scoped result persistence and counter-based filenames exactly as they are today; `ai-extension/server` omits it and just returns results to the agent.

**Tech Stack:** TypeScript, `@langchain/tavily` (Tavily search API), `langchain`'s `tool()`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-09-22-shared-web-search-tool-design.md`

---

## Before starting

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git fetch github main
git checkout -b feat/ai-extension-web-search github/main
```

(If a branch by this name already exists locally with the spec commit on it — from an
earlier brainstorming session — just check it out instead: `git checkout feat/ai-extension-web-search`.)

---

## Task 1: `createWebSearchTool` in `langchain-agent-kit`

**Files:**
- Modify: `lib/langchain-agent-kit/package.json`
- Create: `lib/langchain-agent-kit/src/web-search.ts`
- Create: `lib/langchain-agent-kit/src/web-search.test.ts`
- Modify: `lib/langchain-agent-kit/src/index.ts`

- [ ] **Step 1: Add the `@langchain/tavily` dependency**

In `lib/langchain-agent-kit/package.json`, inside `"dependencies"`, add (alphabetized):

```json
        "@langchain/core": "^1.2.9",
        "@langchain/tavily": "^1.2.0",
        "langchain": "^1.4.0",
```

Then:

```bash
cd lib/langchain-agent-kit && pnpm install
```

Expected: no errors; `@langchain/tavily` appears in the `pnpm install` summary.

- [ ] **Step 2: Write the failing test**

Create `lib/langchain-agent-kit/src/web-search.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWebSearchTool } from "./web-search.ts";

const mockCall = vi.fn();

vi.mock("@langchain/tavily", () => ({
    TavilySearch: vi.fn().mockImplementation(() => ({ _call: mockCall })),
}));

beforeEach(() => {
    mockCall.mockReset();
});

describe("createWebSearchTool", () => {
    it("applies default args when omitted and returns the raw result", async () => {
        mockCall.mockResolvedValue({ results: ["a"] });
        const searchTool = createWebSearchTool();

        const result = await searchTool.invoke({ query: "hello" });

        expect(result).toEqual({ results: ["a"] });
        expect(mockCall).toHaveBeenCalledWith({ query: "hello" });
    });

    it("calls onResult with args, result, and config when provided", async () => {
        mockCall.mockResolvedValue({ results: ["b"] });
        const onResult = vi.fn();
        const searchTool = createWebSearchTool({ onResult });

        await searchTool.invoke(
            { query: "topic test", maxResults: 3, topic: "news", includeRawContent: true },
            { configurable: { thread_id: "device:test:1" } }
        );

        expect(onResult).toHaveBeenCalledTimes(1);
        const [args, result] = onResult.mock.calls[0];
        expect(args).toEqual({ query: "topic test", maxResults: 3, topic: "news", includeRawContent: true });
        expect(result).toEqual({ results: ["b"] });
    });

    it("does not throw and still returns the result when onResult is omitted", async () => {
        mockCall.mockResolvedValue({ results: [] });
        const searchTool = createWebSearchTool();

        await expect(searchTool.invoke({ query: "no callback" })).resolves.toEqual({ results: [] });
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd lib/langchain-agent-kit && pnpm test
```

Expected: FAIL — `web-search.ts` doesn't exist yet (`Cannot find module './web-search.ts'` or similar).

- [ ] **Step 4: Implement `createWebSearchTool`**

Create `lib/langchain-agent-kit/src/web-search.ts`:

```ts
import { z } from "zod";
import { tool } from "langchain";
import { TavilySearch } from "@langchain/tavily";
import type { ToolRunnableConfig } from "@langchain/core/tools";

export type WebSearchTopic = "general" | "news" | "finance";

export interface WebSearchArgs {
    query: string;
    maxResults: number;
    topic: WebSearchTopic;
    includeRawContent: boolean;
}

// Builds a Tavily-backed web_search tool. onResult, when given, is awaited
// after a successful search with the resolved args, the raw Tavily
// response, and the tool's own RunnableConfig — e.g. so a caller needing
// device-scoped persistence (see whatsap/tools/web-search.tool.ts) can read
// whatever it needs off config without this module knowing what a "device"
// is. Omit it to just return the result, no side effects (ai-extension's
// case).
export function createWebSearchTool(opts?: {
    onResult?: (args: WebSearchArgs, result: unknown, config: ToolRunnableConfig) => void | Promise<void>;
}) {
    return tool(
        async (
            {
                query,
                maxResults = 5,
                topic = "general" as WebSearchTopic,
                includeRawContent = false,
            }: {
                query: string;
                maxResults?: number;
                topic?: WebSearchTopic;
                includeRawContent?: boolean;
            },
            config
        ) => {
            console.log(
                `Running web search for query: "${query}" with maxResults=${maxResults}, topic=${topic}, includeRawContent=${includeRawContent}`
            );

            const tavilySearch = new TavilySearch({
                maxResults,
                tavilyApiKey: process.env.TAVILY_API_KEY,
                includeRawContent,
                topic,
            });
            // @ts-ignore - Type instantiation is excessively deep and possibly infinite.
            const result = await tavilySearch._call({ query });

            if (opts?.onResult) {
                await opts.onResult({ query, maxResults, topic, includeRawContent }, result, config);
            }

            return result;
        },
        {
            name: "web_search",
            description: "Run a web search",
            schema: z.object({
                query: z.string().describe("The search query"),
                maxResults: z
                    .number()
                    .optional()
                    .default(5)
                    .describe("Maximum number of results to return"),
                topic: z
                    .enum(["general", "news", "finance"])
                    .optional()
                    .default("general")
                    .describe("Search topic category"),
                includeRawContent: z
                    .boolean()
                    .optional()
                    .default(false)
                    .describe("Whether to include raw content"),
            }),
        }
    );
}
```

- [ ] **Step 5: Run the test again**

```bash
cd lib/langchain-agent-kit && pnpm test
```

Expected: PASS (3 new tests).

- [ ] **Step 6: Type-check and resolve the `@ts-ignore`**

```bash
cd lib/langchain-agent-kit && npx tsc --noEmit
```

If this passes with the `@ts-ignore` line present, temporarily delete just that comment line
and re-run `npx tsc --noEmit`. If it now fails with a type error on the `tavilySearch._call(...)`
line, put the `@ts-ignore` comment back (the error is pre-existing in `whatsap`'s original code
and isn't something this refactor introduces or can easily fix — `@langchain/tavily`'s
`_call` type is what's excessively deep). If it *doesn't* fail without the comment, leave it
removed — dead suppression comments should go.

Expected either way: `npx tsc --noEmit` passes with no errors in the final state.

- [ ] **Step 7: Add the barrel export**

In `lib/langchain-agent-kit/src/index.ts`, add:

```ts
export { createWebSearchTool } from "./web-search.ts";
export type { WebSearchArgs, WebSearchTopic } from "./web-search.ts";
```

- [ ] **Step 8: Run the full kit suite once more**

```bash
cd lib/langchain-agent-kit && pnpm test && npx tsc --noEmit
```

Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add lib/langchain-agent-kit/package.json lib/langchain-agent-kit/pnpm-lock.yaml \
        lib/langchain-agent-kit/src/web-search.ts lib/langchain-agent-kit/src/web-search.test.ts \
        lib/langchain-agent-kit/src/index.ts
git commit -m "feat: add createWebSearchTool to langchain-agent-kit"
```

---

## Task 2: Refactor `whatsap`'s web-search tool onto the shared factory

**Files:**
- Modify: `whatsap/tools/web-search.tool.ts`
- Modify: `whatsap/package.json`

- [ ] **Step 1: Add the kit dependency's install output check (already a whatsap dependency from PR 1) and rewrite the tool file**

Replace the full contents of `whatsap/tools/web-search.tool.ts` with:

```ts
import { createWebSearchTool } from "langchain-agent-kit";
import fs from "node:fs";
import path from "node:path";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

// initialize search with a year-month-day-hour to avoid collisions in caching or tracking
let searchCountBase = new Date().getTime();
let searchCount = 0;

export const webSearch = createWebSearchTool({
    onResult: (args, result, config) => {
        searchCount++;

        // store in this device's own research directory (see
        // lib/device-scoped-path.ts) with a filename based on the search base
        // and research count
        const researchDir = resolveDeviceScopedPath(config, "research");
        fs.mkdirSync(researchDir, { recursive: true });
        const resultFileName = `${searchCountBase}_${searchCount}_results.json`;
        fs.writeFileSync(path.join(researchDir, resultFileName), JSON.stringify(result, null, 2));

        // store the query about the search with the same filename format but with query instead of results
        const queryFileName = `${searchCountBase}_${searchCount}_query.json`;
        fs.writeFileSync(
            path.join(researchDir, queryFileName),
            JSON.stringify({ query: args.query, topic: args.topic }, null, 2)
        );
    },
});
```

This preserves the exact filenames (`${searchCountBase}_${searchCount}_results.json` /
`_query.json`) and persisted JSON shapes (`result` as-is, `{ query, topic }` for the query
file) from the original implementation — only the Tavily-calling logic moved into the kit.

- [ ] **Step 2: Remove the now-unused direct `@langchain/tavily` dependency**

In `whatsap/package.json`, remove this line from `"dependencies"` (the tool file no longer
imports `@langchain/tavily` directly — `langchain-agent-kit` depends on it for its own use):

```json
    "@langchain/tavily": "^1.2.0",
```

Then:

```bash
cd whatsap && pnpm install
```

Expected: no errors; `@langchain/tavily` is removed from `whatsap`'s own `node_modules` top
level (it remains available transitively inside `langchain-agent-kit`'s own `node_modules`,
which is all `whatsap`'s code needs since it no longer imports it directly).

- [ ] **Step 3: Run whatsap's test suite**

```bash
cd whatsap && pnpm test
```

Expected: PASS, same test count as before (this tool has no existing test file to lose).

- [ ] **Step 4: Manually verify persisted output is unchanged**

There's no existing automated test for this tool's file-writing behavior, so verify by hand:
temporarily run the tool against a throwaway device directory and confirm the two files it
writes match the shape described in Step 1's comment. If `TAVILY_API_KEY` isn't available in
this environment, skip actually calling Tavily and instead read `whatsap/tools/web-search.tool.ts`
side-by-side with `git show HEAD~1:whatsap/tools/web-search.tool.ts` (the pre-refactor
version, adjusting the ref if more commits land first) to confirm the file-naming and
JSON-shape logic is byte-for-byte the same, just relocated into the `onResult` callback.

- [ ] **Step 5: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add whatsap/tools/web-search.tool.ts whatsap/package.json whatsap/pnpm-lock.yaml
git commit -m "refactor: build whatsap's web-search tool on langchain-agent-kit"
```

---

## Task 3: Wire `web_search` into `ai-extension/server`

**Files:**
- Create: `ai-extension/server/tools/web-search.tool.ts`
- Modify: `ai-extension/server/agent.ts`
- Modify: `ai-extension/server/.env.example`

- [ ] **Step 1: Create the tool file**

Create `ai-extension/server/tools/web-search.tool.ts`:

```ts
import { createWebSearchTool } from "langchain-agent-kit";

export const webSearchTool = createWebSearchTool();
```

- [ ] **Step 2: Wire it into `agent.ts`**

In `ai-extension/server/agent.ts`, change:
```ts
import { executeBashTool } from "./tools/execute-bash.tool.ts";
import { createSkillMiddleware, createLogModelCallMiddleware } from "langchain-agent-kit";
```
to:
```ts
import { executeBashTool } from "./tools/execute-bash.tool.ts";
import { webSearchTool } from "./tools/web-search.tool.ts";
import { createSkillMiddleware, createLogModelCallMiddleware } from "langchain-agent-kit";
```

Then change:
```ts
const agent = createAgent({
    model,
    tools: [readFileTool, writeFileTool, listDirectoryTool, createDirectoryTool, executeBashTool],
    checkpointer,
    systemPrompt: new SystemMessage(systemPrompt),
    middleware: [skillMiddleware, logModelCallMiddleware],
});
```
to:
```ts
const agent = createAgent({
    model,
    tools: [readFileTool, writeFileTool, listDirectoryTool, createDirectoryTool, executeBashTool, webSearchTool],
    checkpointer,
    systemPrompt: new SystemMessage(systemPrompt),
    middleware: [skillMiddleware, logModelCallMiddleware],
});
```

- [ ] **Step 3: Add the dependency and install**

In `ai-extension/server/package.json`, `langchain-agent-kit` is already a dependency (from
PR 1) and doesn't need re-adding, but the newly-added `@langchain/tavily` inside the kit
needs to actually be present. Run:

```bash
cd ai-extension/server && pnpm install
```

Expected: no errors — this re-links `langchain-agent-kit` and, since the kit's own
`package.json` now lists `@langchain/tavily`, pulls it into the kit's own `node_modules`
(verify with `ls lib/langchain-agent-kit/node_modules/@langchain/tavily` if unsure).

- [ ] **Step 4: Document the new env var**

In `ai-extension/server/.env.example`, add this block after the existing `MAX_CONTEXT_CHARS`
line:

```
# Required at runtime for the web_search tool (Tavily-backed) — a missing key
# surfaces as an error only when the tool is actually invoked, not at
# startup. Already present in the repo root's shared .env.whatsap-llama for
# Docker; set it here too for local `node index.ts` runs.
TAVILY_API_KEY=
```

- [ ] **Step 5: Run ai-extension/server's test suite**

```bash
cd ai-extension/server && pnpm test
```

Expected: PASS, same test count as before (no existing test imports `agent.ts`'s tool list
directly in a way this would break — verify by checking output for unexpected failures, not
just an unchanged count, since a wiring mistake in `agent.ts` would show up as an import/
module-resolution error at test-collection time across the whole suite, not a single test
failure).

- [ ] **Step 6: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add ai-extension/server/tools/web-search.tool.ts ai-extension/server/agent.ts \
        ai-extension/server/.env.example
git commit -m "feat: wire web_search tool into ai-extension/server"
```

---

## Task 4: Update `critique-text` skill and documentation

**Files:**
- Modify: `ai-extension/server/skills/critique-text/SKILL.md`
- Modify: `ai-extension/server/CLAUDE.md`

- [ ] **Step 1: Update the skill**

Current content of `ai-extension/server/skills/critique-text/SKILL.md`:

```markdown
---
name: critique-text
description: Critically review text from a web page — arguments, evidence, clarity, and bias. Use when the user asks to review, critique, fact-check, or find flaws in selected or full-page text.
---

# Critique Text Skill

Use this when the user attaches page/selection context and asks for a critical review,
fact-check, or general opinion of the text.

## Approach

1. Identify the text's main claim(s) or purpose.
2. Evaluate:
   - **Argument structure** — is the reasoning sound? Any logical fallacies or unsupported leaps?
   - **Evidence** — are claims backed by data, citations, or examples? Is the evidence current and relevant?
   - **Clarity** — is the writing clear, or vague/ambiguous in ways that matter?
   - **Bias/framing** — does the text present one side, omit context, or use loaded language?
3. Structure the response as: a one-sentence summary of what the text argues, followed by
   specific strengths, specific weaknesses (quote or point to the exact part of the text),
   and (if asked) a verdict or recommendation.
4. Be specific — vague feedback like "could be clearer" is not useful; point to the exact
   sentence or claim and say what's wrong with it.
5. If no context was attached and the user's message doesn't include the text to review,
   ask them to select the text or use the "Use page" button before proceeding.
```

Replace the `## Approach` section's numbered list with:

```markdown
## Approach

1. Identify the text's main claim(s) or purpose.
2. Evaluate:
   - **Argument structure** — is the reasoning sound? Any logical fallacies or unsupported leaps?
   - **Evidence** — are claims backed by data, citations, or examples? Is the evidence current and relevant?
   - **Clarity** — is the writing clear, or vague/ambiguous in ways that matter?
   - **Bias/framing** — does the text present one side, omit context, or use loaded language?
3. For specific, checkable factual claims that matter to the critique (dates, statistics,
   named sources, "X happened/said Y") — use the `web_search` tool to verify them against
   current results before rendering a verdict. Skip this for claims that are opinion,
   too vague to check, or not material to the argument; not every sentence needs a search.
4. Structure the response as: a one-sentence summary of what the text argues, followed by
   specific strengths, specific weaknesses (quote or point to the exact part of the text,
   and cite what a search turned up if you checked a claim), and (if asked) a verdict or
   recommendation.
5. Be specific — vague feedback like "could be clearer" is not useful; point to the exact
   sentence or claim and say what's wrong with it.
6. If no context was attached and the user's message doesn't include the text to review,
   ask them to select the text or use the "Use page" button before proceeding.
```

- [ ] **Step 2: Update `ai-extension/server/CLAUDE.md`**

Change:
```
- `agent.ts` — the LangChain agent: `ChatAnthropic` model, file/directory/bash tools,
  `createSkillMiddleware`/`createLogModelCallMiddleware` (from `langchain-agent-kit`),
  `MemorySaver` checkpointer keyed by the `threadId` the extension sends.
```
to:
```
- `agent.ts` — the LangChain agent: `ChatAnthropic` model, file/directory/bash tools, a
  Tavily-backed `web_search` tool, `createSkillMiddleware`/`createLogModelCallMiddleware`
  (from `langchain-agent-kit`), `MemorySaver` checkpointer keyed by the `threadId` the
  extension sends.
```

Change:
```
- Requires `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and `EXTENSION_ID` set (see `.env.example`)
  — `index.ts` throws at startup if `EXTENSION_ID` is missing, `agent.ts` throws if
  `ANTHROPIC_MODEL` is missing.
```
to:
```
- Requires `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and `EXTENSION_ID` set (see `.env.example`)
  — `index.ts` throws at startup if `EXTENSION_ID` is missing, `agent.ts` throws if
  `ANTHROPIC_MODEL` is missing. `TAVILY_API_KEY` is also required for the `web_search` tool,
  but isn't validated at startup — a missing key only surfaces as an error when the agent
  actually calls that tool.
```

- [ ] **Step 3: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add ai-extension/server/skills/critique-text/SKILL.md ai-extension/server/CLAUDE.md
git commit -m "docs: reflect web_search capability in critique-text skill and CLAUDE.md"
```

---

## Task 5: Final verification and PR

- [ ] **Step 1: Clean install and test everything**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent/lib/langchain-agent-kit && pnpm install && pnpm test && npx tsc --noEmit
cd /mnt/data/sources/tryyourideas/web/whatsap-agent/whatsap && pnpm install && pnpm test
cd /mnt/data/sources/tryyourideas/web/whatsap-agent/ai-extension/server && pnpm install && pnpm test
```

Expected: all PASS, no type errors in the kit.

- [ ] **Step 2: Confirm `@langchain/tavily` isn't duplicated as an unused direct dependency**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
grep -n "@langchain/tavily" whatsap/package.json lib/langchain-agent-kit/package.json
grep -rn "@langchain/tavily\|TavilySearch" whatsap --include="*.ts" | grep -v node_modules
```

Expected: `@langchain/tavily` appears only in `lib/langchain-agent-kit/package.json`; no
`.ts` file in `whatsap` imports `@langchain/tavily` or `TavilySearch` directly anymore
(only `lib/langchain-agent-kit/src/web-search.ts` does).

- [ ] **Step 3: Push and open the PR**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git push -u github feat/ai-extension-web-search
```

Then (same token-extraction pattern used for the two prior PRs in this repo, since the
`gh` CLI account may lack collaborator access):

```bash
TOKEN=$(git remote get-url github | sed -n 's#.*://[^:]*:\([^@]*\)@.*#\1#p')
GH_TOKEN="$TOKEN" gh pr create --title "feat: shared web-search tool for ai-extension/server" --body "..."
```

Body should summarize: the `createWebSearchTool` factory added to `langchain-agent-kit`,
`whatsap`'s refactor onto it (no behavior change), `ai-extension/server` gaining the tool,
and the `critique-text` skill update — linking
`docs/superpowers/specs/2026-09-22-shared-web-search-tool-design.md`.

---

## Self-review notes

- **Spec coverage:** every spec section (`createWebSearchTool` API, `whatsap` refactor,
  `ai-extension/server` wiring + env/docs, `critique-text` skill update, testing, rollout)
  has a corresponding task.
- **Placeholder scan:** no TBDs; the one place a value can't be known ahead of time (whether
  the `@ts-ignore` is still needed under the kit's exact dependency versions) is resolved by
  an empirical step (Task 1 Step 6), not left as a guess.
- **Type consistency:** `createWebSearchTool(opts?: { onResult?: (args: WebSearchArgs, result: unknown, config: ToolRunnableConfig) => void | Promise<void> })`
  is the same shape used in Task 1 (kit), Task 2 (`whatsap`'s `onResult` callback signature
  matches: `(args, result, config)`), and Task 3 (`ai-extension/server` calling it with no
  args at all, which the `opts?` optionality supports).
