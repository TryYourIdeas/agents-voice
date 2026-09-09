# Scheduled Task Isolation & Explicit Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the root cause of the `exceed_context_size_error` crash (a recurring scheduled task's conversation thread growing unbounded across firings) by giving every scheduled-task execution a fresh, isolated thread, with continuity for recurring tasks coming only from an explicit, agent-curated per-task memory file.

**Architecture:** `scheduler.ts`'s `fireTask` switches from a fixed `scheduled:<task-name>` thread id (reused forever) to a unique `scheduled:<task-name>:<timestamp>` id per run. `lib/tasks.ts` gains two new functions (`readTaskMemory`/`writeTaskMemory`) operating on `tasks/memory/<task-name>.md`, a location deliberately separate from the general-purpose `memory/` system. Recurring-task bodies are wrapped with prior notes (if any) plus a write-back instruction before being sent to the agent; one-off tasks are unaffected beyond also getting a fresh thread.

**Tech Stack:** TypeScript (Node v26 native TS execution), vitest (already set up).

**Reference:** Full design in `docs/superpowers/specs/2026-09-07-scheduled-task-isolation-and-memory-design.md`.

**Testing approach:** Same as prior plans in this project — vitest for pure logic (the new `lib/tasks.ts` functions and `scheduler.ts`'s `buildRecurringPrompt`), real end-to-end verification against the running containers for anything touching the live WhatsApp client or the model.

---

### Task 1: Per-task memory file storage (`lib/tasks.ts`)

**Files:**
- Modify: `whatsap/lib/tasks.ts`
- Modify: `whatsap/lib/tasks.test.ts`

- [ ] **Step 1: Add `TASK_MEMORY_DIR` and the two new functions**

In `whatsap/lib/tasks.ts`, add this constant alongside the existing `TASKS_DIR`/`ARCHIVE_DIR`:

```typescript
export const TASK_MEMORY_DIR = "./tasks/memory";
```

And add these two functions after `archiveTask` (end of the file):

```typescript
// Per-task continuity memory for recurring tasks — see the design doc
// (2026-09-07-scheduled-task-isolation-and-memory-design.md). Deliberately
// separate from the general-purpose memory/ system: this is scheduler
// plumbing, not something a live chat browses, so there's no index.md here
// and the file is created lazily (never a placeholder at task-creation
// time). One-off tasks never touch this — see scheduler.ts's fireTask.
export function readTaskMemory(name: string): string | undefined {
    const filePath = path.join(TASK_MEMORY_DIR, `${name}.md`);
    if (!existsSync(filePath)) return undefined;
    const content = readFileSync(filePath, "utf-8").trim();
    return content || undefined;
}

export function writeTaskMemory(name: string, content: string): void {
    mkdirSync(TASK_MEMORY_DIR, { recursive: true });
    writeFileSync(path.join(TASK_MEMORY_DIR, `${name}.md`), content.trim() + "\n", "utf-8");
}
```

- [ ] **Step 2: Add unit tests**

In `whatsap/lib/tasks.test.ts`, add this import to the existing import line (extend it, don't duplicate the import statement):

```typescript
import { slugify, writeNewTask, readTask, listActiveTaskNames, updateLastRun, archiveTask, readTaskMemory, writeTaskMemory } from "./tasks.ts";
```

And add this new `describe` block at the end of the file (the existing `beforeEach`/`afterEach` chdir-to-scratch-dir setup at the top of the file already applies to every test in the file, including these):

```typescript
describe("task memory", () => {
    it("readTaskMemory returns undefined when no file exists", () => {
        expect(readTaskMemory("no-such-task")).toBeUndefined();
    });

    it("writeTaskMemory then readTaskMemory round-trips trimmed content", () => {
        writeTaskMemory("my-task", "  Some notes.  \n\n");
        expect(readTaskMemory("my-task")).toBe("Some notes.");
    });

    it("writeTaskMemory creates tasks/memory/ lazily", () => {
        expect(existsSync("tasks/memory")).toBe(false);
        writeTaskMemory("my-task", "notes");
        expect(existsSync("tasks/memory/my-task.md")).toBe(true);
    });

    it("writeTaskMemory overwrites rather than appends", () => {
        writeTaskMemory("my-task", "first");
        writeTaskMemory("my-task", "second");
        expect(readTaskMemory("my-task")).toBe("second");
    });
});
```

This requires `existsSync` to be imported in the test file — add it to the existing `import { mkdtempSync, rmSync } from "node:fs";` line, making it `import { mkdtempSync, rmSync, existsSync } from "node:fs";`.

- [ ] **Step 3: Run the tests**

Run: `cd whatsap && pnpm test`
Expected: all tests pass, including the 4 new ones (10 total in `lib/tasks.test.ts`, up from 6).

- [ ] **Step 4: Commit**

```bash
cd whatsap && git add lib/tasks.ts lib/tasks.test.ts && git commit -m "feat: add per-task continuity memory storage (tasks/memory/)"
```

---

### Task 2: Fresh thread per firing + recurring-task memory wrapping (`scheduler.ts`)

**Files:**
- Modify: `whatsap/scheduler.ts`
- Modify: `whatsap/scheduler.test.ts`

- [ ] **Step 1: Import the new memory functions**

In `whatsap/scheduler.ts`, change:

```typescript
import { listActiveTaskNames, readTask, updateLastRun, archiveTask, type ScheduledTask } from "./lib/tasks.ts";
```

to:

```typescript
import { listActiveTaskNames, readTask, updateLastRun, archiveTask, readTaskMemory, TASK_MEMORY_DIR, type ScheduledTask } from "./lib/tasks.ts";
```

(`writeTaskMemory` is not imported here — the agent writes to `tasks/memory/<name>.md` itself via the `my_write_file` tool, following the path stated in the prompt text built in Step 2; `scheduler.ts` only ever *reads* task memory, never writes it.)

- [ ] **Step 2: Add `buildRecurringPrompt`**

Add this exported function in `whatsap/scheduler.ts`, right after `isDue` (so it sits alongside the other pure, testable functions):

```typescript
// Wraps a recurring task's body with its prior continuity notes (if any)
// and a write-back instruction, so the agent has explicit, curated context
// instead of relying on conversation history that no longer persists across
// firings (see fireTask's threadId below). One-off tasks never call this —
// they have no continuity concept at all.
export function buildRecurringPrompt(task: ScheduledTask, priorNotes: string | undefined): string {
    const memoryPath = `${TASK_MEMORY_DIR}/${task.name}.md`;
    if (priorNotes) {
        return (
            `## Notes from previous runs\n\n${priorNotes}\n\n---\n\n## This run's task\n\n${task.body}\n\n` +
            `If anything from this run is worth remembering next time, update your notes using the ` +
            `write_file tool at ${memoryPath} — keep it concise (distilled notes, not a raw transcript); ` +
            `overwrite rather than append.`
        );
    }
    return (
        `${task.body}\n\nThis is the first run of this recurring task. If continuity across future runs would ` +
        `help (e.g. tracking progress, avoiding repeats), create ${memoryPath} with concise notes using the ` +
        `write_file tool, and keep it updated on future runs.`
    );
}
```

- [ ] **Step 3: Use a fresh thread id and wrap recurring bodies in `fireTask`**

Change:

```typescript
async function fireTask(client: any, task: ScheduledTask): Promise<void> {
    const chatId = await resolveChatIdByName(client, task.destinationChat);
    if (!chatId) {
        throw new Error(`destination chat '${task.destinationChat}' not found`);
    }

    // Dedicated thread per task, separate from any live chat thread — see
    // named-agents.ts's own `agent:${agentName}:${threadId}` namespacing for
    // the same rationale applied to named-agent conversations.
    const threadId = `scheduled:${task.name}`;
    const response =
        task.targetAgent === "default" ? await callAgent(task.body, threadId) : await callNamedAgent(task.targetAgent, task.body, threadId);

    await sendAgentResponse(client, chatId, response);

    if (task.scheduleType === "once") {
        archiveTask(task.name, "completed");
    } else {
        updateLastRun(task.name, new Date().toISOString());
    }
}
```

to:

```typescript
async function fireTask(client: any, task: ScheduledTask): Promise<void> {
    const chatId = await resolveChatIdByName(client, task.destinationChat);
    if (!chatId) {
        throw new Error(`destination chat '${task.destinationChat}' not found`);
    }

    // A fresh, unique thread id every single firing — never reused across
    // runs of the same task. This is the actual fix for the
    // exceed_context_size_error crash: the previous fixed
    // `scheduled:${task.name}` id let raw tool-call history (web_search
    // results included) accumulate forever across every firing of a
    // recurring task. Continuity a recurring task actually needs comes from
    // the explicit tasks/memory/ file (see buildRecurringPrompt) instead —
    // never from conversation history. This id is also structurally
    // disjoint from every live-chat thread id (`chatId` for the default
    // agent, `agent:<name>:<chatId>` for a named agent), so a scheduled
    // run's thread can never collide with or leak into a live chat's own
    // conversation memory — delivery below only ever sends the final result
    // text, never touching any thread's stored state.
    const threadId = `scheduled:${task.name}:${Date.now()}`;

    const body =
        task.scheduleType === "recurring" ? buildRecurringPrompt(task, readTaskMemory(task.name)) : task.body;

    const response =
        task.targetAgent === "default" ? await callAgent(body, threadId) : await callNamedAgent(task.targetAgent, body, threadId);

    await sendAgentResponse(client, chatId, response);

    if (task.scheduleType === "once") {
        archiveTask(task.name, "completed");
    } else {
        updateLastRun(task.name, new Date().toISOString());
    }
}
```

- [ ] **Step 4: Add unit tests for `buildRecurringPrompt`**

In `whatsap/scheduler.test.ts`, change the import line:

```typescript
import { isDue } from "./scheduler.ts";
```

to:

```typescript
import { isDue, buildRecurringPrompt } from "./scheduler.ts";
```

And add this `describe` block at the end of the file:

```typescript
describe("buildRecurringPrompt", () => {
    const recurringTask = task({ name: "daily-news", scheduleType: "recurring", body: "Summarize today's news." });

    it("includes a first-run note and write-back instruction when there are no prior notes", () => {
        const prompt = buildRecurringPrompt(recurringTask, undefined);
        expect(prompt).toContain("Summarize today's news.");
        expect(prompt).toContain("first run of this recurring task");
        expect(prompt).toContain("tasks/memory/daily-news.md");
    });

    it("includes prior notes and the task body when notes exist", () => {
        const prompt = buildRecurringPrompt(recurringTask, "Yesterday covered topic X.");
        expect(prompt).toContain("Yesterday covered topic X.");
        expect(prompt).toContain("Summarize today's news.");
        expect(prompt).toContain("## Notes from previous runs");
        expect(prompt).toContain("## This run's task");
    });
});
```

- [ ] **Step 5: Run the tests**

Run: `cd whatsap && pnpm test`
Expected: all tests pass, including the 2 new ones (7 total in `scheduler.test.ts`, up from 5).

- [ ] **Step 6: Commit**

```bash
cd whatsap && git add scheduler.ts scheduler.test.ts && git commit -m "bugfix: give every scheduled task run a fresh thread instead of accumulating history

Fixes the exceed_context_size_error crash: a recurring task's conversation
thread (scheduled:<name>) was reused across every firing, so raw tool-call
history (web_search results included) grew without bound. Every run now
gets a unique thread id; recurring tasks get continuity from an explicit,
agent-curated tasks/memory/<name>.md file instead (see buildRecurringPrompt)."
```

---

### Task 3: End-to-end verification against the running stack

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and restart the stack**

Run: `cd /mnt/data/sources/agents-voice && docker compose -f docker-compose-whatsap.yml up --build -d`
Expected: all services build and start; `whatsap` reconnects (no QR needed) — confirm via `docker compose -f docker-compose-whatsap.yml logs whatsap | grep -i "client is ready"`.

- [ ] **Step 2: Recreate a scenario shaped like the original crash**

Hand-write a recurring task using a tool likely to produce a large result
(`web_search`), with a short interval for fast testing — e.g.
`whatsap/tasks/verify-isolation.md`:

```markdown
---
name: verify-isolation
description: Verification task — searches the web for a topic every run, to confirm scheduled runs don't accumulate context across firings.
schedule-type: recurring
schedule: "* * * * *"
timezone: UTC
target-agent: default
destination-chat: @jlabrada71
created-by-chat: @jlabrada71
status: active
last-run:
---

Search the web for "current weather news" and reply with exactly one sentence summarizing what you found. Do not mention anything from a previous run.
```

- [ ] **Step 3: Watch it fire at least three times**

Run: `docker compose -f /mnt/data/sources/agents-voice/docker-compose-whatsap.yml logs -f whatsap | grep -iE "scheduler|verify-isolation"`

Expected: it fires roughly once a minute (bounded by the poll interval, not
the every-minute schedule exactly), each firing succeeds (no
`exceed_context_size_error`, no other failure), and `last-run` in
`whatsap/tasks/verify-isolation.md` advances on each firing.

- [ ] **Step 4: Confirm no per-task memory file exists (since the task never wrote one)**

Run: `ls whatsap/tasks/memory/ 2>&1`

Expected: either the directory doesn't exist yet, or it exists without a
`verify-isolation.md` entry — this specific test task's instructions never
ask it to persist anything, so `writeTaskMemory` should never have been
called for it. (This also confirms the system doesn't force a memory file
to exist — it's opt-in, per the agent's own judgment, exactly as designed.)

- [ ] **Step 5: Clean up the throwaway verification task**

```bash
cd whatsap && rm tasks/verify-isolation.md
```

Then trigger any other task write (or hand-edit `tasks/index.md` back to
`(No tasks.)`) so the index stays accurate — same cleanup pattern used in
the original scheduled-task-execution plan's own verification steps.

- [ ] **Step 6: Verify recurring-task memory continuity with a real coaching-style task**

Hand-write a second recurring task targeting a named agent that's expected
to track progress across sessions — e.g. `whatsap/tasks/verify-memory.md`:

```markdown
---
name: verify-memory
description: Verification task — a recurring math-coach check-in, to confirm continuity notes persist across firings via tasks/memory/.
schedule-type: recurring
schedule: "* * * * *"
timezone: UTC
target-agent: math-coach
destination-chat: @jlabrada71
created-by-chat: @jlabrada71
status: active
last-run:
---

This is a recurring practice check-in. If tasks/memory/verify-memory.md doesn't exist yet, create it noting that today's topic was fractions. If it does exist, read it, and reply confirming what topic was noted last time.
```

Watch it fire twice (`docker compose ... logs -f whatsap | grep -iE "scheduler|verify-memory"`); after the **first** firing, confirm
`whatsap/tasks/memory/verify-memory.md` now exists and mentions fractions;
after the **second** firing, confirm the WhatsApp message confirms it read
back that same note (proving continuity worked without relying on
conversation history — the whole point of this design).

- [ ] **Step 7: Clean up**

```bash
cd whatsap && rm tasks/verify-memory.md tasks/memory/verify-memory.md
```

This step-by-step verification is the acceptance test for this feature —
once all seven pass, the fix is confirmed working end-to-end, not just in
unit tests.
