# Scheduled Task Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user schedule the agent to run a task (one-off or recurring) that delivers its result back over WhatsApp, created either via a chat command or by hand-editing a task file, with a dedicated agent that validates/clarifies task details before saving them.

**Architecture:** File-backed task storage under `tasks/` (one file per task, frontmatter + body, same convention as `agent.md`/`SKILL.md`), a new `task-scheduler` named agent + `cron-scheduling` skill that owns creation/validation, three new tools it uses to create/list/cancel tasks, and a `scheduler.ts` polling loop (started from `index.ts` once the WhatsApp client is ready) that fires due tasks and delivers results via a generalized, chat-id-based version of the existing diagram-aware reply helper.

**Tech Stack:** TypeScript (Node v26 native TS execution, no build step), LangChain (`tool()`, `createAgent`), `cron-parser` (new dependency, pinned `^5.10.0`), existing `middleware/frontmatter.ts` parser, `whatsapp-web.js`.

**Reference:** Full design in `docs/superpowers/specs/2026-09-07-scheduled-task-execution-design.md`. One deviation from that doc's illustrative example: task file `description` must be a **single-line** frontmatter value (not a YAML `>` folded block) because `middleware/frontmatter.ts`'s `parseMetadataField` only reads a single `field: value` line — reusing that existing parser (rather than adding a YAML library) is intentional per YAGNI.

**Testing approach:** `whatsap` has no test framework configured (`package.json`'s `test` script is a stub — see `whatsap/CLAUDE.md`). Every task below is instead verified by running the real module directly with `node` (host has Node v26.3.1 and `whatsap/node_modules` already installed, so most steps run on the host without touching Docker) or, where the WhatsApp client itself is required, against the running containers via `docker compose logs`, matching how every other feature in this project has been verified.

---

### Task 1: Add `cron-parser` dependency

**Files:**
- Modify: `whatsap/package.json`

- [ ] **Step 1: Add the dependency**

In `whatsap/package.json`, add to `"dependencies"` (alphabetical, matching the existing list):

```json
    "cron-parser": "^5.10.0",
```

So the `dependencies` block reads (only the new line is added, nothing else changes):

```json
  "dependencies": {
    "@langchain/anthropic": "^1.5.9",
    "@langchain/core": "^1.2.9",
    "@langchain/langgraph": "^1.3.0",
    "@langchain/ollama": "^1.2.7",
    "@langchain/tavily": "^1.2.0",
    "cron-parser": "^5.10.0",
    "deepagents": "^1.10.2",
    "dotenv": "^17.4.2",
    "langchain": "^1.4.0",
    "qrcode-terminal": "^0.12.0",
    "whatsapp-web.js": "^1.34.6",
    "zod": "^4.3.6"
  },
```

- [ ] **Step 2: Install**

Run: `cd whatsap && pnpm install`
Expected: lockfile updates, `node_modules/cron-parser` appears, no errors.

- [ ] **Step 3: Verify the exact API this plan relies on**

Run:
```
cd whatsap && node -e "
import('cron-parser').then(({ CronExpressionParser }) => {
  const iv = CronExpressionParser.parse('0 9 * * MON,THU', { tz: 'America/Argentina/Buenos_Aires', currentDate: new Date() });
  const prev = iv.prev();
  console.log('has toDate:', typeof prev.toDate === 'function');
  console.log(prev.toDate().toISOString());
});
"
```
Expected: `has toDate: true` followed by an ISO timestamp, no errors.

- [ ] **Step 4: Commit**

```bash
cd whatsap && git add package.json pnpm-lock.yaml && git commit -m "config: add cron-parser dependency for scheduled tasks"
```

---

### Task 2: Task file storage (`lib/tasks.ts`)

**Files:**
- Create: `whatsap/lib/tasks.ts`

- [ ] **Step 1: Write the module**

```typescript
// lib/tasks.ts
//
// File-backed storage for scheduled tasks (see
// docs/superpowers/specs/2026-09-07-scheduled-task-execution-design.md).
// Each active task is one file under TASKS_DIR — frontmatter + body, parsed
// with the same middleware/frontmatter.ts used by agent.md/SKILL.md.
// TASKS_DIR/index.md and ARCHIVE_DIR/index.md are regenerated from the
// directory's actual files on every write, so they're a display convenience
// only, never a second source of truth to drift out of sync — the *.md task
// files themselves are authoritative for anything that reads task state
// (see scheduler.ts's listActiveTaskNames() usage).

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter, parseMetadataField } from "../middleware/frontmatter.ts";

export const TASKS_DIR = "./tasks";
export const ARCHIVE_DIR = "./tasks/archive";

export interface ScheduledTask {
    name: string;
    description: string;
    scheduleType: "recurring" | "once";
    schedule: string; // cron expression (recurring) or ISO datetime (once)
    timezone: string;
    targetAgent: string; // "default" or a named agent slug
    destinationChat: string;
    createdByChat: string;
    status: "active" | "paused";
    lastRun?: string;
    body: string;
}

// Same shape of restriction as named-agents.ts's AGENT_NAME_RE — task names
// double as filenames, so this rules out path traversal before ever
// touching the filesystem.
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

// Derives a filesystem-safe, human-readable slug from a task description,
// disambiguating collisions with a numeric suffix.
export function slugify(description: string): string {
    const base =
        description
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 50)
            .replace(/-+$/g, "") || "task";

    if (!existsSync(path.join(TASKS_DIR, `${base}.md`))) return base;

    let n = 2;
    while (existsSync(path.join(TASKS_DIR, `${base}-${n}.md`))) n++;
    return `${base}-${n}`;
}

function serializeTask(task: ScheduledTask): string {
    return [
        "---",
        `name: ${task.name}`,
        `description: ${task.description}`,
        `schedule-type: ${task.scheduleType}`,
        `schedule: ${task.schedule}`,
        `timezone: ${task.timezone}`,
        `target-agent: ${task.targetAgent}`,
        `destination-chat: ${task.destinationChat}`,
        `created-by-chat: ${task.createdByChat}`,
        `status: ${task.status}`,
        `last-run: ${task.lastRun || ""}`,
        "---",
        "",
        task.body.trim(),
        "",
    ].join("\n");
}

export function parseTaskFile(fileText: string, fallbackName: string): ScheduledTask {
    const { metadata, content } = parseFrontmatter(fileText);
    return {
        name: parseMetadataField(metadata, "name") || fallbackName,
        description: parseMetadataField(metadata, "description") || "",
        scheduleType: parseMetadataField(metadata, "schedule-type") === "once" ? "once" : "recurring",
        schedule: parseMetadataField(metadata, "schedule") || "",
        timezone: parseMetadataField(metadata, "timezone") || "UTC",
        targetAgent: parseMetadataField(metadata, "target-agent") || "default",
        destinationChat: parseMetadataField(metadata, "destination-chat") || "",
        createdByChat: parseMetadataField(metadata, "created-by-chat") || "",
        status: parseMetadataField(metadata, "status") === "paused" ? "paused" : "active",
        lastRun: parseMetadataField(metadata, "last-run") || undefined,
        body: content.trim(),
    };
}

export function listActiveTaskNames(): string[] {
    if (!existsSync(TASKS_DIR)) return [];
    return readdirSync(TASKS_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
        .map((e) => e.name.replace(/\.md$/, ""));
}

export function readTask(name: string): ScheduledTask | undefined {
    const filePath = path.join(TASKS_DIR, `${name}.md`);
    if (!existsSync(filePath)) return undefined;
    return parseTaskFile(readFileSync(filePath, "utf-8"), name);
}

function listArchivedTaskNames(): string[] {
    if (!existsSync(ARCHIVE_DIR)) return [];
    return readdirSync(ARCHIVE_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
        .map((e) => e.name.replace(/\.md$/, ""));
}

function regenerateIndex(dir: string, names: string[], archived: boolean): void {
    const lines = names.map((name) => {
        const task = parseTaskFile(readFileSync(path.join(dir, `${name}.md`), "utf-8"), name);
        const schedule = task.scheduleType === "once" ? `once at ${task.schedule}` : task.schedule;
        return `- **${task.name}** — ${task.description} (${schedule})`;
    });
    const header = archived ? "# Archived Tasks\n" : "# Active Tasks\n";
    const body = lines.length > 0 ? lines.join("\n") : "(No tasks.)";
    writeFileSync(path.join(dir, "index.md"), `${header}\n${body}\n`, "utf-8");
}

export function writeNewTask(task: ScheduledTask): void {
    if (!NAME_RE.test(task.name)) {
        throw new Error(`Invalid task name '${task.name}'.`);
    }
    mkdirSync(TASKS_DIR, { recursive: true });
    writeFileSync(path.join(TASKS_DIR, `${task.name}.md`), serializeTask(task), "utf-8");
    regenerateIndex(TASKS_DIR, listActiveTaskNames(), false);
}

export function updateLastRun(name: string, timestamp: string): void {
    const task = readTask(name);
    if (!task) throw new Error(`Task '${name}' not found.`);
    task.lastRun = timestamp;
    writeFileSync(path.join(TASKS_DIR, `${name}.md`), serializeTask(task), "utf-8");
}

// Moves a task file out of TASKS_DIR into ARCHIVE_DIR (used for both a
// one-off task's single completion and a recurring task's cancellation —
// see the design doc's "Task File Format" section for why location, not a
// status flag, marks "no longer active").
export function archiveTask(name: string, reason: string): void {
    const task = readTask(name);
    if (!task) throw new Error(`Task '${name}' not found.`);

    mkdirSync(ARCHIVE_DIR, { recursive: true });
    const archivedText = `${serializeTask(task)}\n<!-- archived: ${new Date().toISOString()} — ${reason} -->\n`;
    writeFileSync(path.join(ARCHIVE_DIR, `${name}.md`), archivedText, "utf-8");
    unlinkSync(path.join(TASKS_DIR, `${name}.md`));

    regenerateIndex(TASKS_DIR, listActiveTaskNames(), false);
    regenerateIndex(ARCHIVE_DIR, listArchivedTaskNames(), true);
}
```

- [ ] **Step 2: Verify round-trip and archival behavior**

Write a temporary verification script (uses a scratch cwd so it doesn't touch the real `tasks/` dir, and imports `lib/tasks.ts` by absolute path so the script's own location doesn't matter):

```javascript
// /tmp/tasks-check/verify.mjs
process.chdir('/tmp/tasks-check');
const m = await import('/mnt/data/sources/agents-voice/whatsap/lib/tasks.ts');
const fs = await import('node:fs');

const task = {
  name: 'water-plants-reminder',
  description: 'Sends a WhatsApp reminder to the chat it was created in.',
  scheduleType: 'recurring',
  schedule: '0 9 * * MON,THU',
  timezone: 'UTC',
  targetAgent: 'default',
  destinationChat: '@jlabrada71',
  createdByChat: '@jlabrada71',
  status: 'active',
  body: 'Remind the user to water the plants.',
};
m.writeNewTask(task);
console.log('names after write:', m.listActiveTaskNames());
console.log('read back:', JSON.stringify(m.readTask('water-plants-reminder')));
m.updateLastRun('water-plants-reminder', '2026-09-07T09:00:00.000Z');
console.log('after updateLastRun:', m.readTask('water-plants-reminder')?.lastRun);
m.archiveTask('water-plants-reminder', 'test');
console.log('names after archive:', m.listActiveTaskNames());
console.log('index.md:', fs.readFileSync('tasks/index.md', 'utf-8'));
console.log('archive/index.md:', fs.readFileSync('tasks/archive/index.md', 'utf-8'));
```

Run:
```
mkdir -p /tmp/tasks-check && node /tmp/tasks-check/verify.mjs
```

Expected: task appears in `listActiveTaskNames()`, `readTask` round-trips every field correctly, `lastRun` updates, and after archiving the task disappears from the active list, `tasks/index.md` shows `(No tasks.)`, and `tasks/archive/index.md` lists it with the `(test)` reason recorded in the archived file's trailing comment.

Clean up: `rm -rf /tmp/tasks-check`

- [ ] **Step 3: Commit**

```bash
cd whatsap && git add lib/tasks.ts && git commit -m "feat: add file-backed scheduled task storage"
```

---

### Task 3: Generalize the diagram-aware reply helper (`lib/send-agent-response.ts`)

**Files:**
- Create: `whatsap/lib/send-agent-response.ts`
- Modify: `whatsap/index.ts:96-127` (remove the old in-file version and its 3 call sites)

- [ ] **Step 1: Write the generalized module**

```typescript
// lib/send-agent-response.ts
//
// Delivers an agent's final reply to a WhatsApp chat, handling the
// [[DIAGRAM:<path>]] marker convention from tools/render-diagram.tool.ts
// (see that file for why the marker exists). Generalized to take a chatId
// instead of a whatsapp-web.js Message object — index.ts's live message
// handlers have a Message to reply to, but scheduler.ts firing a scheduled
// task does not, so both need to go through this same delivery path with
// only the destination chat in common.

import whatsapp from "whatsapp-web.js";

const { MessageMedia } = whatsapp;

const DIAGRAM_MARKER_RE = /\[\[DIAGRAM:([^\]]+)\]\]/g;

export async function sendAgentResponse(client: any, chatId: string, response: string): Promise<void> {
    const diagramPaths = [...response.matchAll(DIAGRAM_MARKER_RE)].map((m) => m[1]);
    const text = response.replace(DIAGRAM_MARKER_RE, "").replace(/\n{3,}/g, "\n\n").trim();

    if (diagramPaths.length === 0) {
        await client.sendMessage(chatId, text);
        return;
    }

    for (const [index, diagramPath] of diagramPaths.entries()) {
        try {
            const media = MessageMedia.fromFilePath(diagramPath);
            await client.sendMessage(chatId, media, index === 0 && text ? { caption: text } : undefined);
        } catch (err) {
            console.error(`[debug] failed to send diagram '${diagramPath}':`, err);
        }
    }

    if (text && diagramPaths.length > 1) {
        await client.sendMessage(chatId, text);
    }
}
```

- [ ] **Step 2: Verify the marker-stripping logic in isolation**

Run:
```
cd whatsap && node -e "
import('./lib/send-agent-response.ts').then(async (m) => {
  const calls = [];
  const fakeClient = { sendMessage: async (...args) => { calls.push(args); } };
  await m.sendAgentResponse(fakeClient, 'chat-1', 'Here you go [[DIAGRAM:/tmp/does-not-exist.png]] enjoy');
  console.log(JSON.stringify(calls));
});
"
```
Expected: one call attempting `MessageMedia.fromFilePath('/tmp/does-not-exist.png')`, which throws (file doesn't exist) and is caught/logged via `console.error`, then — since there was only one diagram — no fallback text send happens (matching the existing single-diagram behavior where the caption carries the text). The console output should show the `[debug] failed to send diagram` line and `calls` should be `[]`.

- [ ] **Step 3: Remove the old version from `index.ts` and update its 3 call sites**

In `whatsap/index.ts`, delete lines 96-127 (the `DIAGRAM_MARKER_RE` constant and the local `sendAgentResponse` function) and add this import near the top, alongside the existing `./agent.ts` import:

```typescript
import { sendAgentResponse } from './lib/send-agent-response.ts'
```

Then update the three existing call sites (all currently `await sendAgentResponse(message, response);`) to pass the client and chat id instead:

1. In the audio-transcription branch: `await sendAgentResponse(client, message.from, response);`
2. In the `@agent <name>` branch: `await sendAgentResponse(client, message.from, response);`
3. In the default (catch-all) branch: `await sendAgentResponse(client, message.from, response);`

Also remove `MessageMedia` from the top-of-file destructure, since it's no longer used directly in `index.ts`:

Change:
```typescript
const { Client, LocalAuth, MessageMedia } = whatsapp
```
to:
```typescript
const { Client, LocalAuth } = whatsapp
```

- [ ] **Step 4: Manually confirm no leftover references**

Run: `cd whatsap && grep -n "sendAgentResponse\|MessageMedia\|DIAGRAM_MARKER_RE" index.ts`
Expected: only the new `import { sendAgentResponse } ...` line and the 3 updated call sites — no `MessageMedia` or `DIAGRAM_MARKER_RE` left in `index.ts`.

- [ ] **Step 5: Commit**

```bash
cd whatsap && git add lib/send-agent-response.ts index.ts && git commit -m "refactor: generalize sendAgentResponse to a chatId so scheduler.ts can reuse it"
```

---

### Task 4: The three scheduling tools

**Files:**
- Create: `whatsap/tools/create-scheduled-task.tool.ts`
- Create: `whatsap/tools/list-scheduled-tasks.tool.ts`
- Create: `whatsap/tools/cancel-scheduled-task.tool.ts`
- Modify: `whatsap/shared.ts`

- [ ] **Step 1: `create_scheduled_task`**

```typescript
// tools/create-scheduled-task.tool.ts
import { tool } from "langchain";
import { z } from "zod";
import { slugify, writeNewTask, type ScheduledTask } from "../lib/tasks.ts";

export const createScheduledTaskTool = tool(
    async ({ description, scheduleType, schedule, timezone, targetAgent, destinationChat, createdByChat, body }) => {
        if (!description || description.trim().length < 10) {
            return "Cannot create task: 'description' is missing or too short. It must state where the output goes and what communication should happen (e.g. 'sends a WhatsApp reminder to the chat it was created in'). Ask the user, then try again.";
        }
        if (!/chat|message|send|notif|reply|whatsapp/i.test(description)) {
            return "Cannot create task: 'description' doesn't mention where the output goes or what communication happens. Ask the user to clarify, then try again.";
        }
        if (!schedule || !schedule.trim()) {
            return "Cannot create task: 'schedule' is missing. Confirm the timing with the user (and convert it to a cron expression or ISO datetime) before calling this tool again.";
        }
        if (!destinationChat || !destinationChat.trim()) {
            return "Cannot create task: 'destinationChat' is missing. Confirm which chat should receive the result before calling this tool again.";
        }
        if (!targetAgent || !targetAgent.trim()) {
            return "Cannot create task: 'targetAgent' is missing — use \"default\" unless the user wants a specific named agent.";
        }
        if (!body || !body.trim()) {
            return "Cannot create task: 'body' (the instruction to run when this fires) is missing.";
        }

        const name = slugify(description);
        const task: ScheduledTask = {
            name,
            description: description.trim(),
            scheduleType,
            schedule: schedule.trim(),
            timezone: timezone?.trim() || "UTC",
            targetAgent: targetAgent.trim(),
            destinationChat: destinationChat.trim(),
            createdByChat: createdByChat?.trim() || destinationChat.trim(),
            status: "active",
            body: body.trim(),
        };
        writeNewTask(task);
        return `Scheduled task '${name}' created. ${
            scheduleType === "once" ? `Runs once at ${task.schedule}` : `Runs on schedule '${task.schedule}' (timezone ${task.timezone})`
        }, output goes to '${task.destinationChat}'.`;
    },
    {
        name: "create_scheduled_task",
        description:
            "Create a new scheduled task after confirming every detail with the user: what the task should do " +
            "(becomes the task body sent to the target agent), when it runs (translate natural language into a " +
            "cron expression for recurring tasks, or an ISO datetime for one-off tasks), which agent should " +
            "handle it ('default' or a named agent), and which chat the result should be sent to. Do not call " +
            "this until all of that is confirmed and unambiguous — if the tool returns a validation failure, " +
            "ask the user the missing question and call it again once you have the answer.",
        schema: z.object({
            description: z.string().describe(
                "Human-readable summary of the task, MUST state where the output goes and what communication happens (e.g. 'sends a WhatsApp reminder to the chat it was created in')."
            ),
            scheduleType: z.enum(["recurring", "once"]),
            schedule: z.string().describe("A cron expression (recurring) or ISO 8601 datetime (once)."),
            timezone: z.string().optional().describe("IANA timezone, e.g. 'America/Argentina/Buenos_Aires'. Defaults to UTC if omitted."),
            targetAgent: z.string().describe("'default' or the slug of a named agent under ./agents."),
            destinationChat: z.string().describe("Display name of the chat the result should be sent to (as shown by '@ai list channels')."),
            createdByChat: z.string().optional().describe("Display name of the chat this task was created from, if known."),
            body: z.string().describe("The instruction sent to the target agent when this task fires."),
        }),
    }
);
```

- [ ] **Step 2: `list_scheduled_tasks`**

```typescript
// tools/list-scheduled-tasks.tool.ts
import { tool } from "langchain";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { TASKS_DIR } from "../lib/tasks.ts";

export const listScheduledTasksTool = tool(
    async () => {
        const indexPath = path.join(TASKS_DIR, "index.md");
        if (!existsSync(indexPath)) return "No scheduled tasks yet.";
        return readFileSync(indexPath, "utf-8");
    },
    {
        name: "list_scheduled_tasks",
        description: "List every currently active scheduled task, with its description and schedule.",
        schema: z.object({}),
    }
);
```

- [ ] **Step 3: `cancel_scheduled_task`**

```typescript
// tools/cancel-scheduled-task.tool.ts
import { tool } from "langchain";
import { z } from "zod";
import { archiveTask } from "../lib/tasks.ts";

export const cancelScheduledTaskTool = tool(
    async ({ name }) => {
        try {
            archiveTask(name, "cancelled");
            return `Task '${name}' cancelled and archived.`;
        } catch (err: any) {
            return `Could not cancel task '${name}': ${err?.message || String(err)}`;
        }
    },
    {
        name: "cancel_scheduled_task",
        description: "Cancel an active scheduled task by its name (slug), moving it to the archive so it no longer runs.",
        schema: z.object({
            name: z.string().describe("The task's slug/name, as shown by list_scheduled_tasks."),
        }),
    }
);
```

- [ ] **Step 4: Register the tools in `shared.ts`**

In `whatsap/shared.ts`, add the three imports alongside the existing tool imports:

```typescript
import { createScheduledTaskTool } from "./tools/create-scheduled-task.tool.ts";
import { listScheduledTasksTool } from "./tools/list-scheduled-tasks.tool.ts";
import { cancelScheduledTaskTool } from "./tools/cancel-scheduled-task.tool.ts";
```

And extend the `sharedTools` array (currently ending in `renderDiagramTool`):

```typescript
export const sharedTools = [readFileTool, writeFileTool, listDirectoryTool, checkDirectoryExistsTool, createDirectoryTool, executeBashTool, fetchUrlTool, webSearch, renderDiagramTool, createScheduledTaskTool, listScheduledTasksTool, cancelScheduledTaskTool];
```

- [ ] **Step 5: Verify `create_scheduled_task` rejects an incomplete call and accepts a complete one**

Run (from `whatsap/`, using a scratch cwd so it doesn't touch the real `tasks/` dir):

```
cd /tmp && mkdir -p tool-check && cd tool-check && node -e "
process.chdir('/tmp/tool-check');
import('/mnt/data/sources/agents-voice/whatsap/tools/create-scheduled-task.tool.ts').then(async (m) => {
  const missing = await m.createScheduledTaskTool.invoke({
    description: 'too short',
    scheduleType: 'once',
    schedule: '',
    targetAgent: 'default',
    destinationChat: '',
    body: 'do the thing',
  });
  console.log('missing schedule/chat result:', missing);

  const ok = await m.createScheduledTaskTool.invoke({
    description: 'Sends a WhatsApp reminder to the chat it was created in every Monday.',
    scheduleType: 'recurring',
    schedule: '0 9 * * MON',
    targetAgent: 'default',
    destinationChat: '@jlabrada71',
    body: 'Say good morning.',
  });
  console.log('valid create result:', ok);
  console.log(require('node:fs').readFileSync('tasks/index.md', 'utf-8'));
});
"
```
Expected: `missing schedule/chat result` contains a validation-failure string (schedule missing message, since that check runs first); `valid create result` starts with `Scheduled task '...' created.`; `tasks/index.md` lists the new task.

Clean up: `rm -rf /tmp/tool-check`

- [ ] **Step 6: Commit**

```bash
cd whatsap && git add tools/create-scheduled-task.tool.ts tools/list-scheduled-tasks.tool.ts tools/cancel-scheduled-task.tool.ts shared.ts && git commit -m "feat: add create/list/cancel scheduled task tools"
```

---

### Task 5: `cron-scheduling` skill and `task-scheduler` agent

**Files:**
- Create: `whatsap/skills/cron-scheduling/SKILL.md`
- Create: `whatsap/agents/task-scheduler/agent.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: cron-scheduling
description: Cron syntax reference and natural-language-to-cron translation guidance, including timezone handling, for creating scheduled tasks.
---

# Cron Scheduling

Use this when translating a user's natural-language timing request into the
`schedule`/`schedule-type`/`timezone` fields `create_scheduled_task` needs.

## Cron format

Five fields, space-separated: `minute hour day-of-month month day-of-week`.

| Field | Range | Notes |
|---|---|---|
| minute | 0-59 | |
| hour | 0-23 | 24-hour clock |
| day-of-month | 1-31 | |
| month | 1-12 | |
| day-of-week | 0-6 or SUN-SAT | Both 0 and 7 mean Sunday — prefer the three-letter names (MON, TUE, ...) to avoid ambiguity. |

`*` means "every value". Comma-separated lists (`MON,THU`) and ranges (`1-5`)
are both supported.

## Natural language → cron examples

| User said | schedule-type | schedule | Notes |
|---|---|---|---|
| "every day at 9am" | recurring | `0 9 * * *` | |
| "every weekday at 9am" | recurring | `0 9 * * MON-FRI` | |
| "every Monday and Thursday at 9am" | recurring | `0 9 * * MON,THU` | |
| "every hour" | recurring | `0 * * * *` | |
| "on the 1st of every month" | recurring | `0 0 1 * *` | |
| "in 2 hours" | once | ISO datetime = now + 2h | Compute the literal datetime — don't invent a cron expression for a one-off. |
| "tomorrow at 6pm" | once | ISO datetime for that date/time | |

## Timezone

Always set `timezone` explicitly (IANA name, e.g.
`America/Argentina/Buenos_Aires`). Default to the container's local
timezone if the user doesn't name one — don't guess a different timezone
from context (a display name, a phone number) without confirming; if truly
unsure, ask.

## Common pitfalls

- "Morning" / "afternoon" / "evening" are ambiguous — ask for (or confirm) a
  specific hour before creating the task.
- A day-of-week list must use `MON`/`TUE`/... or `0`-`6` consistently — don't
  mix, and remember `0` and `7` both mean Sunday.
- For a one-off task, `schedule` is an ISO datetime, never a cron string —
  don't cron-ify something that only needs to happen once.
```

- [ ] **Step 2: Write the agent**

```markdown
---
name: task-scheduler
description: Creates, lists, and cancels scheduled tasks — one-off or recurring — that run an agent on a schedule and deliver the result to a WhatsApp chat. Use when the user wants to schedule something for later, set up a reminder, or automate a recurring check-in.
allowed-tools: create_scheduled_task, list_scheduled_tasks, cancel_scheduled_task, my_read_file, list_directory
allowed-skills: cron-scheduling
---

# Task Scheduler Agent

You create, list, and cancel scheduled tasks. A scheduled task runs an agent
(the default agent, or a specific named agent) on a schedule and sends the
result to a WhatsApp chat.

## Core Rule: Never Guess, Always Confirm

Before calling `create_scheduled_task`, you must have explicit, unambiguous
answers to every one of these — ask one clarifying question at a time for
anything missing or unclear, exactly like the math-coach and
system-design-coach agents ask one question at a time rather than
front-loading a checklist:

1. **What should happen** — the actual instruction to run (becomes the task
   body). Vague requests ("remind me about the thing") need a follow-up
   question before you have enough to schedule anything.
2. **When** — translate the user's natural-language timing into a cron
   expression (recurring) or an ISO datetime (once) using the
   `cron-scheduling` skill. If the phrasing is ambiguous ("in the morning"),
   ask for a specific time rather than guessing one.
3. **Which agent handles it** — `default` unless the user names a specific
   one (e.g. "have system-design-coach send me a practice question"). Use
   `list_directory` on `./agents` if you need to confirm a named agent
   exists.
4. **Where the result goes** — a destination chat. If the request came with
   a note like "(this conversation is happening in chat: X)", default to
   that chat unless the user says otherwise — don't ask again in that case,
   since the default is already known. If there's no such note (e.g. this
   conversation reached you through delegation from the default agent, with
   no chat context attached), ask which chat the result should go to.

`description` (the field `create_scheduled_task` requires) must itself state
where the output goes and what communication happens — write it as a
complete sentence a stranger could read on its own, e.g. "Every Monday at
9am, sends a WhatsApp reminder to @jlabrada71 to review the weekly plan."

## When `create_scheduled_task` Returns a Validation Failure

Treat its message as the next question to ask the user — don't retry the
same call with guessed values, and don't apologize at length; just ask.

## Listing and Cancelling

- "what tasks do I have" / similar → `list_scheduled_tasks`, then relay the
  result as-is (it's already formatted for reading).
- "cancel X" / "stop the Y reminder" → confirm which task slug matches
  (list first if unsure), then `cancel_scheduled_task`.

## Tone

Be efficient — this is a utility agent, not a coaching one. Confirm details,
create the task, state back what was scheduled and where it goes. No need
for extended back-and-forth once the required fields are actually clear.
```

- [ ] **Step 3: Verify frontmatter parses correctly**

Run:
```
cd whatsap && node -e "
import('./middleware/frontmatter.ts').then(({ parseFrontmatter, parseMetadataField, parseMetadataListField }) => {
  const fs = require('node:fs');
  const text = fs.readFileSync('agents/task-scheduler/agent.md', 'utf-8');
  const { metadata } = parseFrontmatter(text);
  console.log('name:', parseMetadataField(metadata, 'name'));
  console.log('allowed-tools:', parseMetadataListField(metadata, 'allowed-tools'));
  console.log('allowed-skills:', parseMetadataListField(metadata, 'allowed-skills'));
});
"
```
Expected: `name: task-scheduler`, `allowed-tools` is an array of exactly `['create_scheduled_task', 'list_scheduled_tasks', 'cancel_scheduled_task', 'my_read_file', 'list_directory']`, `allowed-skills` is `['cron-scheduling']`.

- [ ] **Step 4: Verify the named agent loads without throwing**

Run (requires `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` set, e.g. via `whatsap/.env` — same precondition as every other named-agent check in this project):
```
cd whatsap && node -e "
import('./named-agents.ts').then((m) => {
  console.log('agents:', m.listAvailableAgents());
  console.log('headers:', JSON.stringify(m.listAgentHeaders()));
});
"
```
Expected: `task-scheduler` appears in both lists, with its `description` from the frontmatter — confirms `getNamedAgent('task-scheduler')` would build without throwing (headers are only returned for agents whose file parsed successfully).

- [ ] **Step 5: Commit**

```bash
cd whatsap && git add skills/cron-scheduling agents/task-scheduler && git commit -m "feat: add task-scheduler agent and cron-scheduling skill"
```

---

### Task 6: Scheduler polling loop (`scheduler.ts`)

**Files:**
- Create: `whatsap/scheduler.ts`

- [ ] **Step 1: Write the module**

```typescript
// scheduler.ts
//
// Polls tasks/ every SCHEDULER_POLL_INTERVAL_MS and fires anything due.
// Started from index.ts once the WhatsApp client reports 'ready' (needs
// client.pupPage for chat-name resolution and client.sendMessage for
// delivery — see resolveChatIdByName/fireTask below).

import { CronExpressionParser } from "cron-parser";
import { callAgent, callNamedAgent } from "./agent.ts";
import { sendAgentResponse } from "./lib/send-agent-response.ts";
import { listActiveTaskNames, readTask, updateLastRun, archiveTask, type ScheduledTask } from "./lib/tasks.ts";

const POLL_INTERVAL_MS = process.env.SCHEDULER_POLL_INTERVAL_MS
    ? Number(process.env.SCHEDULER_POLL_INTERVAL_MS)
    : 60000;

let polling = false;

export function startScheduler(client: any): void {
    console.log(`[scheduler] started, polling every ${POLL_INTERVAL_MS}ms`);
    setInterval(() => {
        void pollOnce(client);
    }, POLL_INTERVAL_MS);
}

async function pollOnce(client: any): Promise<void> {
    // Guards against a slow agent call overlapping the next tick — see the
    // design doc's Scheduler Execution Loop section.
    if (polling) return;
    polling = true;
    try {
        for (const name of listActiveTaskNames()) {
            const task = readTask(name);
            if (!task || task.status !== "active") continue;
            try {
                if (isDue(task)) {
                    console.log(`[scheduler] firing task '${task.name}'`);
                    await fireTask(client, task);
                }
            } catch (err) {
                // Left last-run/location untouched on purpose — retried
                // next poll, no dead-letter mechanism. See design doc's
                // Error Handling section for why this is enough here.
                console.error(`[scheduler] task '${task.name}' failed:`, err);
            }
        }
    } finally {
        polling = false;
    }
}

export function isDue(task: ScheduledTask): boolean {
    const now = new Date();
    if (task.scheduleType === "once") {
        return now >= new Date(task.schedule);
    }
    const prev = CronExpressionParser.parse(task.schedule, { tz: task.timezone, currentDate: now }).prev().toDate();
    if (!task.lastRun) return prev <= now;
    return prev > new Date(task.lastRun);
}

async function resolveChatIdByName(client: any, name: string): Promise<string | undefined> {
    // Same window.Store.Chat.getModelsArray() approach index.ts's "list
    // channels" command uses, reversed: name -> id instead of id -> name.
    const chats: { name: string; id: string }[] = await client.pupPage!.evaluate(() => {
        // @ts-ignore - window.Store is injected by whatsapp-web.js, not typed
        return window.Store.Chat.getModelsArray().map((chat: any) => ({
            name: chat.isGroup ? `${chat.formattedTitle || chat.name} (group)` : chat.formattedTitle || chat.name || chat.id.user,
            id: chat.id._serialized,
        }));
    });
    return chats.find((c) => c.name === name)?.id;
}

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

- [ ] **Step 2: Verify `isDue` in isolation (no client/network needed)**

Run:
```
cd whatsap && node -e "
import('./scheduler.ts').then(({ isDue }) => {
  const now = new Date();
  const pastOnce = { scheduleType: 'once', schedule: new Date(now.getTime() - 60000).toISOString() };
  const futureOnce = { scheduleType: 'once', schedule: new Date(now.getTime() + 3600000).toISOString() };
  console.log('past one-off due:', isDue(pastOnce));
  console.log('future one-off due:', isDue(futureOnce));

  const everyMinuteNeverRun = { scheduleType: 'recurring', schedule: '* * * * *', timezone: 'UTC' };
  console.log('every-minute, never run, due:', isDue(everyMinuteNeverRun));

  const everyMinuteJustRan = { scheduleType: 'recurring', schedule: '* * * * *', timezone: 'UTC', lastRun: new Date().toISOString() };
  console.log('every-minute, just ran, due:', isDue(everyMinuteJustRan));
});
"
```
Expected: `past one-off due: true`, `future one-off due: false`, `every-minute, never run, due: true`, `every-minute, just ran, due: false`.

- [ ] **Step 3: Commit**

```bash
cd whatsap && git add scheduler.ts && git commit -m "feat: add scheduler polling loop for scheduled tasks"
```

---

### Task 7: Wire the scheduler and new commands into `index.ts`

**Files:**
- Modify: `whatsap/index.ts`

- [ ] **Step 1: Import what's needed**

Near the top of `index.ts`, alongside the existing imports:

```typescript
import { startScheduler } from './scheduler.ts'
import { archiveTask } from './lib/tasks.ts'
```

- [ ] **Step 2: Start the scheduler once the client is ready**

Change:
```typescript
client.on('ready', () => {
    console.log('Client is ready!');
});
```
to:
```typescript
client.on('ready', () => {
    console.log('Client is ready!');
    startScheduler(client);
});
```

- [ ] **Step 3: Add `list tasks`, `cancel task <name>`, and `schedule <text>` commands**

In the `@ai`-prefixed dispatch chain in `index.ts`, insert three new `else if` branches after the existing `else if (request.toLowerCase() === 'list agents') { ... }` block and before the existing `else if (/^@agent\b/i.test(request)) { ... }` block:

```typescript
        } else if (request.toLowerCase() === 'list tasks') {
            try {
                const indexPath = path.join(process.cwd(), 'tasks', 'index.md');
                const content = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : 'No scheduled tasks yet.';
                await message.reply(content);
            } catch (err) {
                console.error('[debug] list tasks failed:', err);
                await message.reply('Sorry, something went wrong listing tasks.');
            }
        } else if (/^cancel task\b/i.test(request)) {
            const cancelMatch = request.match(/^cancel task\s+(\S+)/i);
            const taskName = cancelMatch?.[1];
            if (!taskName) {
                await message.reply('Usage: @ai cancel task <name>');
            } else {
                try {
                    archiveTask(taskName, 'cancelled via @ai cancel task');
                    await message.reply(`Task '${taskName}' cancelled and archived.`);
                } catch (err) {
                    console.error(`[debug] cancel task '${taskName}' failed:`, err);
                    await message.reply(`Could not cancel task '${taskName}': ${(err as any)?.message || 'not found'}`);
                }
            }
        } else if (/^schedule\b/i.test(request)) {
            const scheduleText = request.replace(/^schedule\s*/i, '').trim();
            if (!scheduleText) {
                await message.reply('Usage: @ai schedule <describe the task and when it should run>');
            } else {
                try {
                    const chatName = await getChatNameById(message.from);
                    const contextualized = chatName
                        ? `(this conversation is happening in chat: ${chatName})\n\n${scheduleText}`
                        : scheduleText;
                    const response = await callNamedAgent('task-scheduler', contextualized, message.from);
                    console.log('[debug] task-scheduler response:', response);
                    await sendAgentResponse(client, message.from, response);
                } catch (err) {
                    console.error('[debug] schedule command failed:', err);
                    await message.reply('Sorry, something went wrong creating that scheduled task.');
                }
            }
        } else if (/^@agent\b/i.test(request)) {
```

(Note: this replaces the line `} else if (/^@agent\b/i.test(request)) {` with the block above ending in that same line — the existing `@agent` branch body underneath is unchanged.)

- [ ] **Step 4: Update the `help` command text**

In the `help` branch, change:
```typescript
        if (request.toLowerCase() === 'help') {
            await message.reply(
                'Available commands:\n' +
                '!ping — health check, replies pong\n' +
                '@ai help — show this list\n' +
                '@ai list channels — list all chats the bot can see\n' +
                '@ai list agents — list available named agents (./agents/*)\n' +
                '@ai @agent <agent name> [message] — talk to a named agent\n' +
                '@ai clear session — start fresh, forgetting this chat\'s conversation with every agent\n' +
                '@ai <message> — talk to the default agent\n' +
                `Voice notes sent to: ${STT_ALLOWED_CHATS.join(', ')} — auto-transcribed and forwarded to the default agent`
            );
```
to:
```typescript
        if (request.toLowerCase() === 'help') {
            await message.reply(
                'Available commands:\n' +
                '!ping — health check, replies pong\n' +
                '@ai help — show this list\n' +
                '@ai list channels — list all chats the bot can see\n' +
                '@ai list agents — list available named agents (./agents/*)\n' +
                '@ai @agent <agent name> [message] — talk to a named agent\n' +
                '@ai clear session — start fresh, forgetting this chat\'s conversation with every agent\n' +
                '@ai schedule <describe task and timing> — create a scheduled task (one-off or recurring)\n' +
                '@ai list tasks — list active scheduled tasks\n' +
                '@ai cancel task <name> — cancel a scheduled task\n' +
                '@ai <message> — talk to the default agent\n' +
                `Voice notes sent to: ${STT_ALLOWED_CHATS.join(', ')} — auto-transcribed and forwarded to the default agent`
            );
```

- [ ] **Step 5: Confirm the file still parses/type-checks as a script**

Run: `cd whatsap && node --check index.ts`
Expected: no output, exit code 0 (syntax-valid; this doesn't run the WhatsApp client, just confirms the edits didn't break parsing).

- [ ] **Step 6: Commit**

```bash
cd whatsap && git add index.ts && git commit -m "feat: wire scheduler and add schedule/list tasks/cancel task commands"
```

---

### Task 8: Task storage directories and Docker volume mount

**Files:**
- Create: `whatsap/tasks/index.md`
- Create: `whatsap/tasks/archive/index.md`
- Modify: `/mnt/data/sources/agents-voice/docker-compose-whatsap.yml`

- [ ] **Step 1: Seed the active-tasks index**

```markdown
# Active Tasks

(No tasks.)
```
Save as `whatsap/tasks/index.md`.

- [ ] **Step 2: Seed the archive index**

```markdown
# Archived Tasks

(No tasks.)
```
Save as `whatsap/tasks/archive/index.md`.

- [ ] **Step 3: Add the volume mount**

In `docker-compose-whatsap.yml`, in the `whatsap` service's `volumes:` list, add a new entry alongside the existing `memory`/`diagrams` mounts (after the `diagrams` mount):

```yaml
      # Scheduled tasks (see whatsap/scheduler.ts and lib/tasks.ts) — one
      # file per task under tasks/, archived tasks under tasks/archive/.
      # Without this mount, every image rebuild would wipe all schedules.
      - ./whatsap/tasks:/app/tasks
```

- [ ] **Step 4: Verify the compose file is still valid YAML**

Run: `docker compose -f docker-compose-whatsap.yml config -q`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
cd whatsap && git add tasks/index.md tasks/archive/index.md && git commit -m "feat: seed tasks/ directory for scheduled task storage"
cd /mnt/data/sources/agents-voice && git -C whatsap status --short  # sanity check: compose file lives outside whatsap's own repo
```

Since `docker-compose-whatsap.yml` lives in the parent directory (`/mnt/data/sources/agents-voice`), which is **not** a git repository (confirmed at session start), that file's change is not committed by git — it's just saved to disk directly, same as every other edit to it in this project's history.

---

### Task 9: Documentation

**Files:**
- Modify: `whatsap/CLAUDE.md`

- [ ] **Step 1: Add a section describing the scheduler, matching the existing depth of coverage for skills/agents/memory**

In `whatsap/CLAUDE.md`, after the existing description of named agents and the memory system (wherever that content currently sits in the file), add:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd whatsap && git add CLAUDE.md && git commit -m "docs: document scheduled task execution in whatsap/CLAUDE.md"
```

---

### Task 10: End-to-end verification against the running stack

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and restart the stack**

Run: `cd /mnt/data/sources/agents-voice && docker compose -f docker-compose-whatsap.yml up --build -d`
Expected: all four services build and start; `whatsap` reconnects using the persisted session (no QR needed) — confirm via `docker compose -f docker-compose-whatsap.yml logs whatsap | grep -i "client is ready"`.

- [ ] **Step 2: Hand-write a one-off task due in ~2 minutes**

Create `whatsap/tasks/verify-once.md` (replace `<TWO_MIN_FROM_NOW>` with an actual ISO datetime ~2 minutes in the future, and `<YOUR_CHAT_NAME>` with a real chat name from `@ai list channels`):

```markdown
---
name: verify-once
description: One-off verification task — sends a WhatsApp message confirming the scheduler fired correctly.
schedule-type: once
schedule: <TWO_MIN_FROM_NOW>
timezone: UTC
target-agent: default
destination-chat: <YOUR_CHAT_NAME>
created-by-chat: <YOUR_CHAT_NAME>
status: active
last-run:
---

Reply with exactly: "scheduler verification: one-off task fired successfully."
```

- [ ] **Step 3: Watch it fire**

Run: `docker compose -f docker-compose-whatsap.yml logs -f whatsap | grep -i "scheduler"`
Expected within ~1-2 poll cycles (up to ~2 minutes after the scheduled time): a `[scheduler] firing task 'verify-once'` log line, the WhatsApp message arrives in the target chat, and `whatsap/tasks/verify-once.md` is gone from `whatsap/tasks/` and now present under `whatsap/tasks/archive/verify-once.md` with an `<!-- archived: ... — completed -->` trailing comment; `whatsap/tasks/index.md` shows `(No tasks.)` again and `whatsap/tasks/archive/index.md` lists it.

- [ ] **Step 4: Hand-write a recurring task and confirm it stays active across a fire**

Create `whatsap/tasks/verify-recurring.md` with `schedule-type: recurring` and `schedule: "* * * * *"` (every minute — verification only, delete afterward) targeting the same chat, body `Reply with exactly: "scheduler verification: recurring task fired."`. Confirm via logs that it fires, that `whatsap/tasks/verify-recurring.md`'s `last-run` field gets updated after firing (`cat whatsap/tasks/verify-recurring.md`), and that it fires again on the next minute (not just once). Then delete this file manually (it's a throwaway verification task, not meant to run forever): `rm whatsap/tasks/verify-recurring.md && ` and manually re-run the `regenerateIndex` behavior by triggering any other task write, or simply hand-edit `whatsap/tasks/index.md` back to `(No tasks.)` — either is fine since this is disposable test data.

- [ ] **Step 5: Exercise `@ai schedule` end-to-end, including an incomplete request**

From WhatsApp, send `@ai schedule remind me about something` (deliberately vague/incomplete). Expected: `task-scheduler` responds asking a clarifying question (what to remind about, and/or when) rather than creating a task — confirm no new file appears under `whatsap/tasks/`. Then send a complete follow-up (e.g. `@ai schedule remind me to stretch every day at 3pm`) and confirm a new task file is created with a sensible cron expression and `description` stating the destination chat.

- [ ] **Step 6: Exercise `@ai list tasks` and `@ai cancel task <name>`**

Send `@ai list tasks` — expect the task created in Step 5 to appear. Send `@ai cancel task <its-slug>` (the slug shown in `whatsap/tasks/index.md` or inferred from the description) — expect a confirmation reply, the file moved to `whatsap/tasks/archive/`, and a subsequent `@ai list tasks` no longer showing it.

- [ ] **Step 7: Confirm a named-agent target works**

Create a one-off task with `target-agent: system-design-coach` (or `math-coach`) due in ~2 minutes, same pattern as Step 2. Confirm via logs it invokes `callNamedAgent` (not `callAgent`) and the delivered message reflects that agent's persona/system prompt rather than the default agent's.

This step-by-step verification is the acceptance test for this feature — once all seven pass, the feature is done.
