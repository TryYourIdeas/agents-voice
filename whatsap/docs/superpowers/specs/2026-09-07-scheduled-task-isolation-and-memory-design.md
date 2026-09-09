# Scheduled Task Isolation & Explicit Memory — Design

Date: 2026-09-07
Status: Approved (brainstorm), pending implementation plan

## Purpose

Fix the root cause of a real production failure: a daily recurring scheduled
task (`summarize-iran-war-news-daily-at-9-00-am-and-save`) crashed with
`exceed_context_size_error` (70,215 tokens against a 40,192-token context
window) because `scheduler.ts` reuses one fixed conversation thread
(`scheduled:<task-name>`) across every firing of a recurring task — so the
raw tool-calling history (including large `web_search` results) accumulates
without bound every time the task runs. Raising `llama-server`'s context
window (done separately, see `CONTEXT_SIZE` in `.env.whatsap-llama`) only
delays the same failure for a task that runs daily forever.

The correct fix is architectural, not just a bigger context window:
scheduled task execution must be isolated per run, with any continuity a
recurring task actually needs coming from small, explicit, agent-curated
notes — never from an ever-growing raw conversation thread.

## Requirements (from brainstorm)

1. Every scheduled task execution — one-off or recurring — runs in a fresh,
   isolated context. No raw conversation history accumulates across firings.
2. Recurring tasks that need continuity (e.g. a coaching agent tracking
   progress across sessions, a news task avoiding repeats) get it through
   **explicit, system-provided memory** — a dedicated file per task, not
   through the conversation thread.
3. One-off tasks have no continuity mechanism at all — they persist only
   whatever their own instructions explicitly produce (a file, a sent
   message), nothing more.
4. No scheduled task execution — of either kind — ever feeds into the
   conversation memory of the live chat it notifies, unless a future task
   explicitly asks for that (not built now — YAGNI; the design must not
   preclude it later).
5. Only the task's final result is ever delivered to the destination chat —
   never intermediate reasoning/tool-call traces.

## Non-goals

- No cap/summarization mechanism enforced on the per-task memory file itself
  — keeping it concise is the agent's responsibility (same trust model the
  existing `memory/` system already uses), not a hard limit this design
  enforces.
- No cleanup of `MemorySaver`'s accumulated per-run thread entries (see
  Known Limitation below) — acceptable given `MemorySaver` is in-memory only
  and clears on every container restart.
- No change to how one-off tasks work beyond giving them a fresh thread —
  they already have no continuity concept per requirement 3.

## Design

### 1. Fresh thread id per firing

`scheduler.ts`'s `fireTask` currently computes:

```ts
const threadId = `scheduled:${task.name}`;
```

reused identically on every firing. Change to a per-run unique id:

```ts
const threadId = `scheduled:${task.name}:${Date.now()}`;
```

This alone guarantees `MemorySaver` starts genuinely empty for every single
execution — no prior turn, no prior tool call, no prior `web_search` result
ever appears in a new run's context. This satisfies requirement 1 for both
task types.

### 2. Per-task memory file (recurring tasks only)

New responsibility in `lib/tasks.ts` (already owns every task-file-related
concern):

```ts
export const TASK_MEMORY_DIR = "./tasks/memory";

export function readTaskMemory(name: string): string | undefined {
    const filePath = path.join(TASK_MEMORY_DIR, `${name}.md`);
    return existsSync(filePath) ? readFileSync(filePath, "utf-8").trim() : undefined;
}

export function writeTaskMemory(name: string, content: string): void {
    mkdirSync(TASK_MEMORY_DIR, { recursive: true });
    writeFileSync(path.join(TASK_MEMORY_DIR, `${name}.md`), content.trim() + "\n", "utf-8");
}
```

- Lives under `tasks/memory/<task-name>.md` (per brainstorm decision) — a
  subdirectory scoped to scheduler internals, deliberately **not** part of
  the general-purpose `memory/` system a live chat browses via
  `memory-middleware.ts`. No `index.md` for this directory — it's not meant
  for discovery, only for the scheduler to mechanically read/write per task.
- Created lazily on first write. No placeholder file at task-creation time.
- The agent updates it itself via the existing `my_write_file` tool (already
  available, unrestricted, to every plausible `target-agent` — the default
  agent and every current named agent except `task-scheduler`, which never
  needs it since it's never itself a task's `target-agent`).

### 3. Wrapping the task body for recurring tasks

`scheduler.ts`'s `fireTask`, when `task.scheduleType === "recurring"`, wraps
the body before invoking the agent:

```ts
function buildRecurringPrompt(task: ScheduledTask, priorNotes: string | undefined): string {
    if (priorNotes) {
        return (
            `## Notes from previous runs\n\n${priorNotes}\n\n---\n\n## This run's task\n\n${task.body}\n\n` +
            `If anything from this run is worth remembering next time, update your notes using the ` +
            `write_file tool at ${TASK_MEMORY_DIR}/${task.name}.md — keep it concise (distilled notes, not a ` +
            `raw transcript); overwrite rather than append.`
        );
    }
    return (
        `${task.body}\n\nThis is the first run of this recurring task. If continuity across future runs would ` +
        `help (e.g. tracking progress, avoiding repeats), create ${TASK_MEMORY_DIR}/${task.name}.md with concise ` +
        `notes using the write_file tool, and keep it updated on future runs.`
    );
}
```

One-off tasks (`scheduleType === "once"`) send `task.body` unchanged — no
memory file involved, satisfying requirement 3.

### 4. Isolation invariant (already true — formalize with a comment, no behavior change)

Scheduled-task thread ids (`scheduled:<name>:<timestamp>`) are already
structurally disjoint from every live-chat thread id (`chatId` for the
default agent, `agent:<agentName>:<chatId>` for a named agent) — there is no
code path by which a scheduled run's thread id could collide with or be
derived from a live chat's. Delivery (`sendAgentResponse`) only ever sends
the agent's final text as a plain WhatsApp message via `client.sendMessage`
— it never touches any thread's stored conversation state. This already
satisfies requirement 4; the implementation plan adds a code comment stating
this explicitly next to the thread-id computation in `fireTask`, so the
invariant is documented rather than merely accidental.

### 5. Result-only delivery (already true — no change)

`sendAgentResponse` already sends only the agent's final response text (with
diagram markers swapped for media) — never intermediate tool-call or
reasoning content. Requirement 5 is already satisfied by the existing
`callAgent`/`callNamedAgent` → `sendAgentResponse` flow; no change needed.

## Data Flow Summary

```
scheduler.ts poll tick, task due
  → threadId = scheduled:<name>:<timestamp>   (always fresh)
  → recurring? readTaskMemory(name) → wrap task.body with prior notes + write-back instruction
  → once?      task.body unchanged
  → run target agent against that fresh thread
  → sendAgentResponse delivers only the final text/diagrams to destination-chat
  → recurring: update last-run (memory file itself is updated by the agent's own tool call, if it chose to)
  → once: archive task
```

## Error Handling

No change from the existing design
(`docs/superpowers/specs/2026-09-07-scheduled-task-execution-design.md`):
failures are logged and retried on the next poll, no dead-letter mechanism.
A fresh thread per run means a failed run never leaves partial conversation
state behind to confuse the next attempt — if anything, this makes retries
*more* predictable than before, since retrying no longer means "continue a
half-finished conversation," it means "start over cleanly."

## Known Limitation

`MemorySaver` accumulates one entry per scheduled-task execution for the
life of the process, since thread ids are now never reused. Unlike the bug
this design fixes, each entry is small and bounded (a single fresh run, not
an ever-growing history), so this is slow, bounded-per-entry growth rather
than unbounded-per-thread growth — and `MemorySaver` is in-memory only, so
it clears on every container restart regardless. Not addressed further here
per the stated non-goals.

## Testing / Verification Plan

Consistent with this project's established practice (no test framework for
WhatsApp-client-dependent code; real end-to-end verification against the
running containers) plus the vitest suite now available for pure logic:

1. **Unit tests** (vitest) for the new `lib/tasks.ts` functions:
   `readTaskMemory` returns `undefined` when no file exists and the trimmed
   content when one does; `writeTaskMemory` creates `tasks/memory/` lazily
   and persists content correctly. Also unit-test `scheduler.ts`'s
   `buildRecurringPrompt` (exported for testability, same pattern already
   used for `isDue`) for both the "no prior notes" and "has prior notes"
   cases — pure string-building logic, easily testable in isolation.
2. **End-to-end**: recreate a scenario shaped like the crash — a recurring
   task using `web_search` — and fire it twice in a row (adjusting
   `SCHEDULER_POLL_INTERVAL_MS` or the task's schedule for a fast test
   cycle); confirm via `docker compose logs` that each firing's prompt does
   *not* include the previous firing's tool-call history (e.g. by checking
   the model doesn't reference specifics only visible in the prior run's
   raw trace unless they were written to `tasks/memory/<name>.md`), and that
   `tasks/memory/<name>.md` exists and contains sensible content afterward
   if the agent chose to write it.
3. Confirm a one-off task still behaves exactly as before (no
   `tasks/memory/` file created, fresh thread, archives on completion) —
   regression check against the existing verification steps in the prior
   spec.
