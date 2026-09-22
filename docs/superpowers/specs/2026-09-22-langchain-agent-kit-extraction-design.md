# langchain-agent-kit extraction (PR 1 of 2): frontmatter, skill-middleware, log-model-call-middleware

## Context

`whatsap/` and `ai-extension/server/` are two independent LangChain agents in this repo,
both built with `createAgent()` on matching dependency versions (`langchain@1.4.0`,
`@langchain/anthropic@1.5.9`, `@langchain/core@1.2.9`, `zod@4.3.6`). `ai-extension/server`'s
own `CLAUDE.md` already documents that its skill-middleware and frontmatter parsing are
"own copy[ies], not shared" — a deliberate call made in
`docs/superpowers/specs/2026-09-19-ai-extension-design.md`, at a point when `ai-extension`
was new and independence was the safer default.

That duplication has since drifted: `whatsap`'s `skill-middleware.ts` grew multi-agent
support (`extraDirs`, `allowedSkills`) that `ai-extension`'s copy never got, and the two
`log-model-call-middleware.ts` copies log different content with different prefixes. The
`frontmatter.ts` copies remain identical. Per the workspace root `CLAUDE.md`'s "Shared
libraries" convention, behavior genuinely shared by two or more projects belongs in `lib/`
as its own standalone package rather than staying copy-pasted.

This repo (`web/whatsap-agent`, remote `TryYourIdeas/agents-voice`) is a single git
repository — `whatsap/` and `ai-extension/` are subdirectories of it, not separate repos
(despite `whatsap/CLAUDE.md`'s "own `.git`" note, which no longer reflects reality). The
new package lives at this repo's root, alongside `whatsap/` and `ai-extension/`, mirroring
how the wider `web/` workspace uses a top-level `lib/` for cross-project code.

This is a two-PR extraction (see the "how can the agents and tools be shared" discussion).
This spec covers **PR 1 only**: the three modules above. The file/directory/bash tools are
harder to share (they take different shapes — `whatsap`'s take a LangChain `config` object
for `resolveDeviceScopedPath`; `ai-extension`'s don't) and are deferred to a follow-up PR 2,
scoped and specced separately once PR 1 has landed and both agents are still working off it.

## Goals

- One implementation each of frontmatter parsing, the skills progressive-disclosure
  middleware, and the model-call logging middleware, consumed by both `whatsap` and
  `ai-extension/server`.
- No behavior change for either agent — `ai-extension`'s current (simpler) skill-middleware
  behavior and log format, and `whatsap`'s current (fuller) versions, are each preserved via
  configuration, not merged into a single hardcoded behavior.
- Both agents keep working independently after the change; this is a refactor, not a
  feature.

## Non-goals

- Extracting the file/directory/bash tools (PR 2, separate spec).
- Publishing the package anywhere — it's consumed via a `file:` dependency while it stays
  workspace-local, per the root `CLAUDE.md`.
- Changing either agent's system prompt, model config, or any tool behavior.

## Design

### New package: `lib/langchain-agent-kit/`

A plain TypeScript package (neither consumer is Nuxt, so this isn't a Nuxt module) that
runs the same way both consumers already do — Node's native TS execution, no build step —
so consuming it via a `file:` dependency needs no build step either.

```
lib/langchain-agent-kit/
  package.json          # name: "langchain-agent-kit", type: module
  tsconfig.json
  vitest.config.ts
  src/
    frontmatter.ts
    frontmatter.test.ts
    skill-middleware.ts
    skill-middleware.test.ts
    log-model-call-middleware.ts
    log-model-call-middleware.test.ts
    index.ts            # barrel: re-exports everything above
  README.md
```

`package.json` dependencies pinned to the versions both consumers already use:
`langchain@^1.4.0`, `@langchain/core@^1.2.9`, `zod@^4.3.6`.

### `frontmatter.ts`

Moves `parseFrontmatter`, `parseMetadataField`, and `parseMetadataListField` verbatim from
`whatsap/middleware/frontmatter.ts` (the superset — `ai-extension`'s copy is missing
`parseMetadataListField`, which it doesn't currently call). No logic changes.

### `skill-middleware.ts`

Moves `whatsap/middleware/skill-middleware.ts` verbatim (the superset — supports
`extraDirs` and `allowedSkills` layering for multi-agent use). Public signature:

```ts
export function createSkillMiddleware(
    skillsDir: string = "./skills",
    opts?: { extraDirs?: string[]; allowedSkills?: string[] }
): ReturnType<typeof createMiddleware>
```

This is a **signature change** from `whatsap`'s current
`createSkillMiddleware(extraDirs?, allowedSkills?)` (skills dir was hardcoded to `'./skills'`
internally) — making the base skills directory an explicit first parameter, since a
library function shouldn't hardcode a relative path meaningful only in the context of
whichever process's cwd is running it. `whatsap`'s call sites pass `"./skills"` explicitly
where they previously relied on the default; behavior is unchanged since both processes
still run with `./skills` relative to their own cwd.

`ai-extension/server` gets multi-agent layering it doesn't need but also doesn't use —
calling `createSkillMiddleware("./skills")` with no `opts` reproduces its current
single-agent behavior exactly (verified by test: same skills loaded, same prompt
addendum shape, same `load_skill` tool description text preserved as ai-extension's
current copy — see "Behavior preservation" below for the one text difference kept
call-site-configurable).

### `log-model-call-middleware.ts`

Replaces both hardcoded copies with a factory:

```ts
export function createLogModelCallMiddleware(opts: {
    prefix: string;
    truncate?: number; // afterModel content is truncated to this many chars if set
}): ReturnType<typeof createMiddleware>
```

- `whatsap` calls `createLogModelCallMiddleware({ prefix: "[Middleware]" })` — no
  truncation, matching its current untruncated full-content log.
- `ai-extension/server` calls
  `createLogModelCallMiddleware({ prefix: "[ai-extension]", truncate: 500 })` — matching
  its current `.slice(0, 500)` behavior.

### Behavior preservation

The two current `load_skill` tool descriptions differ slightly in wording (`whatsap`'s is
longer/more formal). Since this text is user-invisible to the extension side panel but
visible to `whatsap`'s agent behavior, the shared middleware keeps `whatsap`'s current
(fuller) description as the single implementation — `ai-extension`'s agent gets marginally
more detailed tool-use guidance, which is a strict improvement, not a regression, and
doesn't change either agent's external behavior.

### Consumer updates

Both `package.json`s add:
```json
"langchain-agent-kit": "file:../../lib/langchain-agent-kit"
```
(relative path from each project's own directory to the repo-root `lib/`), then `pnpm install`.

**`whatsap/`** — replace imports in `agent.ts`, `named-agents.ts`, `device-onboarding.ts`,
`lib/devices.ts`, `lib/tasks.ts` (all found via grep for the extracted symbols) from
relative `./middleware/frontmatter.ts` etc. to `from "langchain-agent-kit"`. Delete
`whatsap/middleware/frontmatter.ts`, `skill-middleware.ts`, `log-model-call-middleware.ts`
and their `.test.ts` files once all call sites are updated and `whatsap`'s own test suite
passes.

**`ai-extension/server/`** — same treatment in `agent.ts`; delete
`ai-extension/server/middleware/frontmatter.ts`, `skill-middleware.ts`,
`log-model-call-middleware.ts` and their `.test.ts` files once `ai-extension/server`'s own
test suite passes.

### Testing

- `lib/langchain-agent-kit` ships its own `vitest` suite, consolidating (not duplicating)
  the test cases currently split across both projects' `.test.ts` files for these three
  modules.
- After migration, `whatsap`'s and `ai-extension/server`'s own `pnpm test` suites must both
  still pass unchanged (they exercise these modules indirectly through `agent.ts` and the
  consumer files listed above) — this is the actual regression check, since the kit's own
  tests only prove the extracted logic in isolation.

## Rollout

Single PR: adds `lib/langchain-agent-kit`, migrates both consumers, deletes the old
duplicated files. Both agents must build and pass tests before merge.

**Docker build-context gotcha**: `docker-compose-whatsap.yml` builds both `whatsap`
(`build: ./whatsap`) and `ai-extension-server` (`build: ./ai-extension/server`) with a
build context scoped to their own subdirectory — neither can see the repo-root `lib/` a
`file:../../lib/langchain-agent-kit` dependency would need. Both `Dockerfile`s need their
build context widened to the repo root (`context: .` in the compose file, `dockerfile:
whatsap/Dockerfile` / `ai-extension/server/Dockerfile`), the same pattern `llama-server`
already uses for its own out-of-directory dependencies, with each `.dockerignore` updated
to allow `lib/` through. This is a real change to both build configs, not just source —
call it out as its own step in the implementation plan.
