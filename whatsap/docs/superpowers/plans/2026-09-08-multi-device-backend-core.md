# Multi-Device Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whatsap backend support multiple WhatsApp devices — each with its own session, tasks, and memory — sharing the same process and shared backend services (`llama-server`/`stt`/`plantuml-renderer`), with new devices onboarded via a `new-devices/` directory drop (no container restart). This plan covers design spec sections 1–4 (device config, multi-client refactor, per-device tasks/scheduler, onboarding poller) — the internal API and Nuxt UI are separate, later plans.

**Architecture:** A `device:<name>:` prefix is wrapped around every existing conversation-thread-id scheme (constructed internally by `agent.ts`/`named-agents.ts`, given a device name + local id — callers never build the string themselves). `lib/tasks.ts` and the agent-instance caches in `agent.ts`/`named-agents.ts`/`memory-middleware.ts` become device-parameterized. `index.ts`'s current monolithic client+handler logic moves into `bot.ts`'s `createDeviceBot(device)`, called once per active device by a thin `index.ts` orchestrator, which also runs a `device-onboarding.ts` poller that picks up `new-devices/<name>.md` drops and materializes them under `devices/<name>/` without a restart.

**Tech Stack:** TypeScript (Node v26 native TS execution), vitest.

**Reference:** Full design in `docs/superpowers/specs/2026-09-08-multi-device-support-design.md`.

**Known limitation carried into this plan**: QR codes still print to the terminal via `qrcode-terminal` (now prefixed with the device name) — if two devices need linking around the same time, their QR output can interleave in one terminal. This is accepted for this plan; the internal API + Nuxt UI plan replaces it.

**Testing approach:** vitest for pure logic (unchanged files' existing tests, plus new/updated tests for device-parameterized modules); real end-to-end verification against the running containers for anything touching the live WhatsApp client.

---

### Task 1: Device config module (`lib/devices.ts`)

**Files:**
- Create: `whatsap/lib/devices.ts`
- Create: `whatsap/lib/devices.test.ts`

- [ ] **Step 1: Write the module**

```typescript
// lib/devices.ts
//
// Device config storage, mirroring lib/tasks.ts's shape. See
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter, parseMetadataField } from "../middleware/frontmatter.ts";

export const DEVICES_DIR = "./devices";

// Device names double as LocalAuth clientIds and directory names — same
// path-traversal-safe restriction as named-agents.ts's AGENT_NAME_RE and
// lib/tasks.ts's NAME_RE.
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface DeviceConfig {
    name: string;
    label: string;
    status: "active" | "paused";
}

export function validateDeviceName(name: string): boolean {
    return NAME_RE.test(name);
}

export function listDeviceNames(): string[] {
    if (!existsSync(DEVICES_DIR)) return [];
    return readdirSync(DEVICES_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(path.join(DEVICES_DIR, e.name, "device.md")))
        .map((e) => e.name);
}

export function readDevice(name: string): DeviceConfig | undefined {
    const filePath = path.join(DEVICES_DIR, name, "device.md");
    if (!existsSync(filePath)) return undefined;
    const { metadata } = parseFrontmatter(readFileSync(filePath, "utf-8"));
    return {
        name: parseMetadataField(metadata, "name") || name,
        label: parseMetadataField(metadata, "label") || name,
        status: parseMetadataField(metadata, "status") === "paused" ? "paused" : "active",
    };
}

// Parses the outermost "device:<name>:" prefix every conversation thread id
// now carries back off, returning the device name and whatever thread-id
// scheme was wrapped inside it (a raw chatId, an "agent:<name>:<chatId>"
// form, or a "scheduled:<taskName>:<timestamp>" form) unchanged — so
// existing parsing logic (tools/get-current-chat.tool.ts,
// agent-delegation-middleware.ts) keeps working exactly as it did before
// devices existed, just operating on `rest` instead of the raw thread id.
export function parseDeviceThreadId(threadId: string): { device: string; rest: string } | undefined {
    const match = threadId.match(/^device:([a-z0-9-]+):(.+)$/);
    if (!match) return undefined;
    return { device: match[1], rest: match[2] };
}
```

- [ ] **Step 2: Write unit tests**

```typescript
// lib/devices.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listDeviceNames, readDevice, validateDeviceName, parseDeviceThreadId } from "./devices.ts";

let scratchDir: string;
let originalCwd: string;

beforeEach(() => {
    originalCwd = process.cwd();
    scratchDir = mkdtempSync(path.join(tmpdir(), "devices-test-"));
    process.chdir(scratchDir);
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(scratchDir, { recursive: true, force: true });
});

function writeDeviceFile(name: string, frontmatter: string) {
    mkdirSync(path.join("devices", name), { recursive: true });
    writeFileSync(path.join("devices", name, "device.md"), `---\n${frontmatter}\n---\n\nBody.\n`, "utf-8");
}

describe("listDeviceNames / readDevice", () => {
    it("returns an empty array when devices/ doesn't exist", () => {
        expect(listDeviceNames()).toEqual([]);
    });

    it("lists a device once its device.md exists", () => {
        writeDeviceFile("primary", "name: primary\nlabel: Primary\nstatus: active");
        expect(listDeviceNames()).toEqual(["primary"]);
    });

    it("readDevice parses all fields, defaulting status to active", () => {
        writeDeviceFile("primary", "name: primary\nlabel: Primary Number");
        expect(readDevice("primary")).toEqual({ name: "primary", label: "Primary Number", status: "active" });
    });

    it("readDevice respects status: paused", () => {
        writeDeviceFile("business", "name: business\nlabel: Business\nstatus: paused");
        expect(readDevice("business")?.status).toBe("paused");
    });

    it("readDevice returns undefined for a device that doesn't exist", () => {
        expect(readDevice("nope")).toBeUndefined();
    });
});

describe("validateDeviceName", () => {
    it("accepts lowercase alphanumeric-with-dashes names", () => {
        expect(validateDeviceName("primary")).toBe(true);
        expect(validateDeviceName("business-2")).toBe(true);
    });

    it("rejects names that could path-traverse or contain unsafe characters", () => {
        expect(validateDeviceName("../etc")).toBe(false);
        expect(validateDeviceName("Has Spaces")).toBe(false);
        expect(validateDeviceName("")).toBe(false);
    });
});

describe("parseDeviceThreadId", () => {
    it("parses a device-prefixed raw chat id", () => {
        expect(parseDeviceThreadId("device:primary:554800000000@c.us")).toEqual({
            device: "primary",
            rest: "554800000000@c.us",
        });
    });

    it("parses a device-prefixed named-agent thread id, leaving the agent: form intact in rest", () => {
        expect(parseDeviceThreadId("device:primary:agent:story-coach:554800000000@c.us")).toEqual({
            device: "primary",
            rest: "agent:story-coach:554800000000@c.us",
        });
    });

    it("parses a device-prefixed scheduled-task thread id", () => {
        expect(parseDeviceThreadId("device:primary:scheduled:daily-news:12345")).toEqual({
            device: "primary",
            rest: "scheduled:daily-news:12345",
        });
    });

    it("returns undefined for a thread id with no device prefix", () => {
        expect(parseDeviceThreadId("554800000000@c.us")).toBeUndefined();
    });
});
```

- [ ] **Step 3: Run the tests**

Run: `cd whatsap && pnpm test lib/devices.test.ts`
Expected: all 10 tests pass.

- [ ] **Step 4: Commit**

```bash
cd whatsap && git add lib/devices.ts lib/devices.test.ts && git commit -m "feat: add device config module (lib/devices.ts)"
```

---

### Task 2: `lib/tasks.ts` becomes device-parameterized

**Files:**
- Modify: `whatsap/lib/tasks.ts`
- Modify: `whatsap/lib/tasks.test.ts`

- [ ] **Step 1: Rewrite the module with a `device` parameter everywhere**

Replace the full contents of `whatsap/lib/tasks.ts` with:

```typescript
// lib/tasks.ts
//
// File-backed storage for scheduled tasks, now scoped per device (see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md). Each
// active task is one file under devices/<device>/tasks/ — frontmatter +
// body, parsed with the same middleware/frontmatter.ts used by
// agent.md/SKILL.md. index.md files are regenerated display listings, not
// a second source of truth — the *.md task files themselves are
// authoritative for anything that reads task state.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter, parseMetadataField } from "../middleware/frontmatter.ts";

export function tasksDir(device: string): string {
    return path.join("devices", device, "tasks");
}

export function archiveDir(device: string): string {
    return path.join(tasksDir(device), "archive");
}

export function taskMemoryDir(device: string): string {
    return path.join(tasksDir(device), "memory");
}

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
// disambiguating collisions with a numeric suffix, scoped to this device's
// own tasks directory (two devices can independently have a task with the
// same slug).
export function slugify(device: string, description: string): string {
    const base =
        description
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 50)
            .replace(/-+$/g, "") || "task";

    if (!existsSync(path.join(tasksDir(device), `${base}.md`))) return base;

    let n = 2;
    while (existsSync(path.join(tasksDir(device), `${base}-${n}.md`))) n++;
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

export function listActiveTaskNames(device: string): string[] {
    const dir = tasksDir(device);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
        .map((e) => e.name.replace(/\.md$/, ""));
}

export function readTask(device: string, name: string): ScheduledTask | undefined {
    const filePath = path.join(tasksDir(device), `${name}.md`);
    if (!existsSync(filePath)) return undefined;
    return parseTaskFile(readFileSync(filePath, "utf-8"), name);
}

function listArchivedTaskNames(device: string): string[] {
    const dir = archiveDir(device);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
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

export function writeNewTask(device: string, task: ScheduledTask): void {
    if (!NAME_RE.test(task.name)) {
        throw new Error(`Invalid task name '${task.name}'.`);
    }
    const dir = tasksDir(device);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${task.name}.md`), serializeTask(task), "utf-8");
    regenerateIndex(dir, listActiveTaskNames(device), false);
}

export function updateLastRun(device: string, name: string, timestamp: string): void {
    const task = readTask(device, name);
    if (!task) throw new Error(`Task '${name}' not found.`);
    task.lastRun = timestamp;
    writeFileSync(path.join(tasksDir(device), `${name}.md`), serializeTask(task), "utf-8");
}

// Moves a task file out of tasksDir(device) into archiveDir(device) (used
// for both a one-off task's single completion and a recurring task's
// cancellation — see the design doc's "Task File Format" section for why
// location, not a status flag, marks "no longer active").
export function archiveTask(device: string, name: string, reason: string): void {
    const task = readTask(device, name);
    if (!task) throw new Error(`Task '${name}' not found.`);

    const archDir = archiveDir(device);
    mkdirSync(archDir, { recursive: true });
    const archivedText = `${serializeTask(task)}\n<!-- archived: ${new Date().toISOString()} — ${reason} -->\n`;
    writeFileSync(path.join(archDir, `${name}.md`), archivedText, "utf-8");
    unlinkSync(path.join(tasksDir(device), `${name}.md`));

    regenerateIndex(tasksDir(device), listActiveTaskNames(device), false);
    regenerateIndex(archDir, listArchivedTaskNames(device), true);
}

// Per-task continuity memory for recurring tasks — see the design doc
// (2026-09-07-scheduled-task-isolation-and-memory-design.md). Deliberately
// separate from the general-purpose memory/ system: this is scheduler
// plumbing, not something a live chat browses, so there's no index.md here
// and the file is created lazily (never a placeholder at task-creation
// time). One-off tasks never touch this — see scheduler.ts's fireTask.
export function readTaskMemory(device: string, name: string): string | undefined {
    const filePath = path.join(taskMemoryDir(device), `${name}.md`);
    if (!existsSync(filePath)) return undefined;
    const content = readFileSync(filePath, "utf-8").trim();
    return content || undefined;
}

export function writeTaskMemory(device: string, name: string, content: string): void {
    const dir = taskMemoryDir(device);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${name}.md`), content.trim() + "\n", "utf-8");
}
```

- [ ] **Step 2: Rewrite the tests with a `device` parameter**

Replace the full contents of `whatsap/lib/tasks.test.ts` with:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { slugify, writeNewTask, readTask, listActiveTaskNames, updateLastRun, archiveTask, readTaskMemory, writeTaskMemory } from "./tasks.ts";

const DEVICE = "primary";

let scratchDir: string;
let originalCwd: string;

beforeEach(() => {
    originalCwd = process.cwd();
    scratchDir = mkdtempSync(path.join(tmpdir(), "tasks-test-"));
    process.chdir(scratchDir);
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(scratchDir, { recursive: true, force: true });
});

describe("lib/tasks.ts", () => {
    function baseTask(overrides: Partial<Parameters<typeof writeNewTask>[1]> = {}) {
        const description = "Sends a WhatsApp reminder to the chat it was created in.";
        return {
            name: slugify(DEVICE, description),
            description,
            scheduleType: "recurring" as const,
            schedule: "0 9 * * MON,THU",
            timezone: "UTC",
            targetAgent: "default",
            destinationChat: "@jlabrada71",
            createdByChat: "@jlabrada71",
            status: "active" as const,
            body: "Remind the user to water the plants.",
            ...overrides,
        };
    }

    it("slugify derives a filesystem-safe slug and disambiguates collisions", () => {
        const task = baseTask();
        writeNewTask(DEVICE, task);
        const second = slugify(DEVICE, task.description);
        expect(second).not.toBe(task.name);
        expect(second.startsWith(task.name)).toBe(true);
    });

    it("writeNewTask + readTask round-trips every field", () => {
        const task = baseTask();
        writeNewTask(DEVICE, task);
        expect(readTask(DEVICE, task.name)).toEqual(task);
    });

    it("listActiveTaskNames reflects the tasks directory", () => {
        expect(listActiveTaskNames(DEVICE)).toEqual([]);
        const task = baseTask();
        writeNewTask(DEVICE, task);
        expect(listActiveTaskNames(DEVICE)).toEqual([task.name]);
    });

    it("updateLastRun persists the new timestamp without changing other fields", () => {
        const task = baseTask();
        writeNewTask(DEVICE, task);
        updateLastRun(DEVICE, task.name, "2026-09-07T09:00:00.000Z");
        expect(readTask(DEVICE, task.name)).toEqual({ ...task, lastRun: "2026-09-07T09:00:00.000Z" });
    });

    it("archiveTask removes the task from the active list", () => {
        const task = baseTask();
        writeNewTask(DEVICE, task);
        archiveTask(DEVICE, task.name, "test");
        expect(listActiveTaskNames(DEVICE)).toEqual([]);
        expect(readTask(DEVICE, task.name)).toBeUndefined();
    });

    it("archiveTask throws for a task that doesn't exist", () => {
        expect(() => archiveTask(DEVICE, "does-not-exist", "test")).toThrow(/not found/);
    });

    it("two devices' tasks with the same name don't collide", () => {
        const task = baseTask();
        writeNewTask("primary", task);
        writeNewTask("business", task);
        expect(listActiveTaskNames("primary")).toEqual([task.name]);
        expect(listActiveTaskNames("business")).toEqual([task.name]);
        archiveTask("primary", task.name, "test");
        expect(listActiveTaskNames("primary")).toEqual([]);
        expect(listActiveTaskNames("business")).toEqual([task.name]);
    });
});

describe("task memory", () => {
    it("readTaskMemory returns undefined when no file exists", () => {
        expect(readTaskMemory(DEVICE, "no-such-task")).toBeUndefined();
    });

    it("writeTaskMemory then readTaskMemory round-trips trimmed content", () => {
        writeTaskMemory(DEVICE, "my-task", "  Some notes.  \n\n");
        expect(readTaskMemory(DEVICE, "my-task")).toBe("Some notes.");
    });

    it("writeTaskMemory creates devices/<device>/tasks/memory/ lazily", () => {
        expect(existsSync("devices/primary/tasks/memory")).toBe(false);
        writeTaskMemory(DEVICE, "my-task", "notes");
        expect(existsSync("devices/primary/tasks/memory/my-task.md")).toBe(true);
    });

    it("writeTaskMemory overwrites rather than appends", () => {
        writeTaskMemory(DEVICE, "my-task", "first");
        writeTaskMemory(DEVICE, "my-task", "second");
        expect(readTaskMemory(DEVICE, "my-task")).toBe("second");
    });
});
```

- [ ] **Step 3: Run the tests**

Run: `cd whatsap && pnpm test lib/tasks.test.ts`
Expected: all 11 tests pass.

- [ ] **Step 4: Commit**

```bash
cd whatsap && git add lib/tasks.ts lib/tasks.test.ts && git commit -m "refactor: scope lib/tasks.ts to devices/<device>/tasks/"
```

---

### Task 3: `lib/whatsapp-client.ts` becomes a multi-device registry

**Files:**
- Modify: `whatsap/lib/whatsapp-client.ts`

- [ ] **Step 1: Rewrite the module**

Replace the full contents of `whatsap/lib/whatsapp-client.ts` with:

```typescript
// lib/whatsapp-client.ts
//
// Tools are built at module-load time (see shared.ts's sharedTools array),
// before any WhatsApp Client exists — and now there can be several, one per
// device (see docs/superpowers/specs/2026-09-08-multi-device-support-design.md).
// This registry lets bot.ts register each device's live client as it's
// created, and any tool/module that needs one at call time (e.g.
// tools/get-current-chat.tool.ts) read it back by device name.

const clients = new Map<string, any>();

export function setWhatsAppClient(deviceName: string, client: any): void {
    clients.set(deviceName, client);
}

export function getWhatsAppClient(deviceName: string): any {
    const client = clients.get(deviceName);
    if (!client) {
        throw new Error(`WhatsApp client for device '${deviceName}' not initialized yet.`);
    }
    return client;
}
```

- [ ] **Step 2: Verify in isolation**

Run:
```
cd whatsap && node -e "
import('./lib/whatsapp-client.ts').then((m) => {
  try { m.getWhatsAppClient('primary'); console.log('FAIL: should have thrown'); }
  catch (e) { console.log('correctly throws before init:', e.message); }
  m.setWhatsAppClient('primary', { fake: 'primary' });
  m.setWhatsAppClient('business', { fake: 'business' });
  console.log('primary:', JSON.stringify(m.getWhatsAppClient('primary')));
  console.log('business:', JSON.stringify(m.getWhatsAppClient('business')));
});
"
```
Expected: throws before init for `'primary'`, then correctly returns each device's own registered client without cross-contamination.

- [ ] **Step 3: Commit**

```bash
cd whatsap && git add lib/whatsapp-client.ts && git commit -m "refactor: lib/whatsapp-client.ts registry keyed by device name"
```

---

### Task 4: Per-device memory middleware

**Files:**
- Modify: `whatsap/middleware/memory-middleware.ts`

- [ ] **Step 1: Turn it into a factory**

Replace the full contents of `whatsap/middleware/memory-middleware.ts` with:

```typescript
import { createMiddleware } from "langchain";
import fs from "node:fs";
import path from "node:path";

// Persistent memory across sessions/restarts, now scoped per device (see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md) — one
// file per memory, plus a single index.md pointing to each with a
// one-line description. Bind-mounted under devices/<device>/memory in
// docker-compose-whatsap.yml so writes survive container recreates.
//
// A factory, not a singleton, because each device (and within a device,
// each agent instance — see agent.ts/named-agents.ts) needs its own scoped
// memory directory — same reasoning as skill-middleware.ts's
// createSkillMiddleware.
export function createMemoryMiddleware(memoryDir: string) {
    const indexPath = path.join(memoryDir, "index.md");
    const defaultIndex = `# Memory Index

Pointers to persisted memory files under this directory. Each entry: a link to the file plus a
one-line description of what it's about, so an agent can decide whether to read the full file
without loading everything into context.

(No memories yet.)
`;

    function readIndex(): string {
        fs.mkdirSync(memoryDir, { recursive: true });
        if (!fs.existsSync(indexPath)) {
            fs.writeFileSync(indexPath, defaultIndex);
        }
        return fs.readFileSync(indexPath, "utf-8");
    }

    return createMiddleware({
        name: "memoryMiddleware",
        wrapModelCall: async (request, handler) => {
            // Re-read on every call (not cached like skills) since memory can
            // change mid-conversation, e.g. right after the agent just wrote to
            // it in a previous tool-call round.
            const index = readIndex();

            const memoryAddendum =
                `\n\n## Memory\n\n` +
                `You have persistent memory across sessions in the \`${memoryDir}\` directory, ` +
                `using the read_file/write_file/list_directory tools. \`${indexPath}\` (below) lists ` +
                `every memory file with a one-line description.\n\n` +
                `- Before assuming you don't know something, check whether the index lists a file ` +
                `that looks relevant, and read it.\n` +
                `- When you learn something worth remembering for future sessions — a fact, a ` +
                `preference, ongoing context, or a piece of user-provided data — write it to a new or ` +
                `existing file under ${memoryDir}/, then add or update its one-line entry in ` +
                `${indexPath} so it stays discoverable. A memory that isn't indexed is effectively lost.\n` +
                `- Keep each memory file focused on one topic, and each index entry to one line.\n` +
                `- CRITICAL: if the user explicitly asks you to remember, save, persist, or not-forget ` +
                `something (e.g. "remember X", "save this for later", "don't make me repeat this"), ` +
                `you MUST actually call write_file to save it and update the index BEFORE you reply — ` +
                `in the same turn, before your final answer. Replying "I'll remember that" or "noted" ` +
                `WITHOUT calling write_file does not save anything and is a failure to follow this ` +
                `instruction, even if you already have the information in this conversation.\n\n` +
                `Current index (${indexPath}):\n\n${index}`;

            return handler({
                ...request,
                systemMessage: request.systemMessage.concat(memoryAddendum),
            });
        },
    });
}
```

- [ ] **Step 2: Confirm no other file still imports the old singleton export**

Run: `cd whatsap && grep -rn "memoryMiddleware" --include="*.ts" . | grep -v node_modules | grep -v ".test.ts"`
Expected: no bare `import { memoryMiddleware }` remaining anywhere yet (Task 5 updates `agent.ts`/`named-agents.ts` to use `createMemoryMiddleware` instead) — this step is just a sanity check that this file itself compiles standalone; the grep will show `agent.ts`/`named-agents.ts` still importing the old name until Task 5 lands, which is expected and fixed there.

- [ ] **Step 3: Commit**

```bash
cd whatsap && git add middleware/memory-middleware.ts && git commit -m "refactor: memory-middleware.ts becomes a per-device factory"
```

---

### Task 5: Device-aware `agent.ts` / `named-agents.ts` / `agent-delegation-middleware.ts`

**Files:**
- Modify: `whatsap/agent.ts`
- Modify: `whatsap/named-agents.ts`
- Modify: `whatsap/middleware/agent-delegation-middleware.ts`

- [ ] **Step 1: Rewrite `agent.ts`**

Replace the full contents of `whatsap/agent.ts` with:

```typescript
import { createAgent } from "langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { readFileSync } from "fs";

import { model, sharedTools, sharedCheckpointer } from "./shared.ts";
import { skillMiddleware } from "./middleware/skill-middleware.ts";
import { createMemoryMiddleware } from "./middleware/memory-middleware.ts";
import { agentDelegationMiddleware } from "./middleware/agent-delegation-middleware.ts";
import { logModelCallMiddleware } from "./middleware/log-model-call-middleware.ts";
import { extractText } from "./util.ts";

export { model } from "./shared.ts";
export { listAvailableAgents, callNamedAgent, clearSession } from "./named-agents.ts";

const executerSystemPrompt = readFileSync("./prompts/executer-system.md", "utf-8");

// One default-agent instance per device — each needs its own
// createMemoryMiddleware scoped to that device's own memory directory (see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md).
const defaultAgents = new Map<string, ReturnType<typeof createAgent>>();

function getDefaultAgent(deviceName: string): ReturnType<typeof createAgent> {
    const cached = defaultAgents.get(deviceName);
    if (cached) return cached;

    const agent = createAgent({
        model: model,
        tools: sharedTools,
        checkpointer: sharedCheckpointer,
        systemPrompt: new SystemMessage(executerSystemPrompt),
        // agentDelegationMiddleware only goes on the default agent — named
        // agents (see named-agents.ts) don't get it, so delegation can't chain
        // into a loop.
        middleware: [
            skillMiddleware,
            createMemoryMiddleware(`devices/${deviceName}/memory`),
            agentDelegationMiddleware,
            logModelCallMiddleware,
        ],
    });
    defaultAgents.set(deviceName, agent);
    return agent;
}

export async function callAgent(deviceName: string, message: string, localThreadId: string): Promise<string> {
    const agent = getDefaultAgent(deviceName);
    const result = await agent.invoke(
        { messages: [new HumanMessage(message)] },
        {
            recursionLimit: 100,
            // Every conversation thread id is wrapped in a "device:<name>:"
            // prefix — constructed here, once, rather than by every caller —
            // see the design doc's "Multi-Client Refactor" section.
            configurable: { thread_id: `device:${deviceName}:${localThreadId}` },
        }
    );
    const { messages: updatedMessages } = result;
    return extractText(updatedMessages[updatedMessages.length - 1].content);
}
```

- [ ] **Step 2: Rewrite `named-agents.ts`**

Replace the full contents of `whatsap/named-agents.ts` with:

```typescript
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "node:path";
import { createAgent } from "langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { model, sharedTools, sharedCheckpointer } from "./shared.ts";
import { createSkillMiddleware } from "./middleware/skill-middleware.ts";
import { createMemoryMiddleware } from "./middleware/memory-middleware.ts";
import { logModelCallMiddleware } from "./middleware/log-model-call-middleware.ts";
import { parseFrontmatter, parseMetadataField, parseMetadataListField } from "./middleware/frontmatter.ts";
import { extractText } from "./util.ts";

// Named agents (whatsap/agents/<name>/agent.md) — each one is its own
// createAgent instance per device (see agent.ts's getDefaultAgent for the
// same reasoning), with its own system prompt, optionally its own skills
// (agents/<name>/skills/*/SKILL.md layered on top of the global ./skills),
// and optionally restricted to a subset of the shared tools.
//
// Split out of agent.ts specifically so agent.ts's delegation middleware
// (middleware/agent-delegation-middleware.ts, which needs callNamedAgent and
// listAgentHeaders) doesn't create a circular import with agent.ts.
//
// Directory names double as agent identifiers, so they're validated the same
// way voice IDs are in text-to-speech (_VOICE_ID_RE) to rule out path
// traversal (e.g. "../../etc/passwd") before ever touching the filesystem.
const AGENTS_DIR = "./agents";
const AGENT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

interface AgentHeader {
    name: string;
    description: string;
    // undefined = no restriction (every shared tool / every discovered
    // skill); [] = explicitly none. See frontmatter.ts's
    // parseMetadataListField for why those two cases are distinguished.
    allowedTools?: string[];
    allowedSkills?: string[];
    content: string;
}

function parseAgentFile(fileText: string, fallbackName: string): AgentHeader {
    const { metadata, content } = parseFrontmatter(fileText);
    const name = parseMetadataField(metadata, "name") || fallbackName;
    const description = parseMetadataField(metadata, "description") || "";
    const allowedTools = parseMetadataListField(metadata, "allowed-tools");
    const allowedSkills = parseMetadataListField(metadata, "allowed-skills");
    return { name, description, allowedTools, allowedSkills, content };
}

function readAgentHeader(agentName: string): AgentHeader | undefined {
    const agentMdPath = path.join(AGENTS_DIR, agentName, "agent.md");
    if (!existsSync(agentMdPath)) return undefined;
    return parseAgentFile(readFileSync(agentMdPath, "utf-8"), agentName);
}

export function listAvailableAgents(): string[] {
    if (!existsSync(AGENTS_DIR)) return [];
    return readdirSync(AGENTS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(path.join(AGENTS_DIR, entry.name, "agent.md")))
        .map((entry) => entry.name);
}

// name + description for every available agent — what the delegation
// middleware shows the default agent, mirroring how skillMiddleware shows
// name + description for every available skill. Agent *definitions* are
// global (not per-device) — only their runtime instances (below) are.
export function listAgentHeaders(): { name: string; description: string }[] {
    return listAvailableAgents()
        .map((name) => readAgentHeader(name))
        .filter((h): h is AgentHeader => Boolean(h))
        .map(({ name, description }) => ({ name, description }));
}

// Keyed by `${deviceName}:${agentName}` — one instance per device per agent.
const namedAgents = new Map<string, ReturnType<typeof createAgent>>();

function getNamedAgent(deviceName: string, agentName: string): ReturnType<typeof createAgent> {
    if (!AGENT_NAME_RE.test(agentName)) {
        throw new Error(`Invalid agent name '${agentName}'.`);
    }

    const cacheKey = `${deviceName}:${agentName}`;
    const cached = namedAgents.get(cacheKey);
    if (cached) return cached;

    const header = readAgentHeader(agentName);
    if (!header) {
        throw new Error(`Agent '${agentName}' not found.`);
    }

    // allowed-tools restricts this agent to a named subset of sharedTools
    // (see agent.md's frontmatter); omitted means no restriction, matching
    // every named agent's behavior before this field existed.
    const tools = header.allowedTools
        ? sharedTools.filter((t) => header.allowedTools!.includes(t.name))
        : sharedTools;

    // Layers this agent's own skills (agents/<name>/skills/*/SKILL.md, if
    // any) on top of the global ones in ./skills — further restricted to
    // allowed-skills if the agent declares it.
    const agentSkillsDir = path.join(AGENTS_DIR, agentName, "skills");
    const namedAgent = createAgent({
        model: model,
        tools,
        checkpointer: sharedCheckpointer,
        systemPrompt: new SystemMessage(header.content),
        middleware: [
            createSkillMiddleware([agentSkillsDir], header.allowedSkills),
            createMemoryMiddleware(`devices/${deviceName}/memory`),
            logModelCallMiddleware,
        ],
    });

    namedAgents.set(cacheKey, namedAgent);
    return namedAgent;
}

export async function callNamedAgent(
    deviceName: string,
    agentName: string,
    message: string,
    localThreadId: string
): Promise<string> {
    const namedAgent = getNamedAgent(deviceName, agentName);
    const result = await namedAgent.invoke(
        { messages: [new HumanMessage(message)] },
        {
            recursionLimit: 100,
            configurable: {
                // Namespaced by device and agent name so switching agents (or
                // talking to the default agent), or switching devices, never
                // cross-contaminates conversation memory.
                thread_id: `device:${deviceName}:agent:${agentName}:${localThreadId}`,
            },
        }
    );
    const { messages: updatedMessages } = result;
    return extractText(updatedMessages[updatedMessages.length - 1].content);
}

// Wipes every conversation thread this chat has, across the default agent
// and every named agent, for this device only — so the next message starts
// from a clean slate. localChatId must be the same value used to key
// threads elsewhere (chatId in bot.ts) — see callNamedAgent's thread_id
// above and agent.ts's callAgent for the corresponding default-agent thread.
export async function clearSession(deviceName: string, localChatId: string): Promise<void> {
    await sharedCheckpointer.deleteThread(`device:${deviceName}:${localChatId}`);
    for (const agentName of listAvailableAgents()) {
        await sharedCheckpointer.deleteThread(`device:${deviceName}:agent:${agentName}:${localChatId}`);
    }
}
```

- [ ] **Step 3: Update `agent-delegation-middleware.ts`**

Replace the full contents of `whatsap/middleware/agent-delegation-middleware.ts` with:

```typescript
import { createMiddleware, tool } from "langchain";
import { z } from "zod";
import { listAgentHeaders, callNamedAgent } from "../named-agents.ts";
import { parseDeviceThreadId } from "../lib/devices.ts";

// Lets the default agent hand off a task to a specialized named agent
// (agents/<name>/agent.md) instead of attempting it directly — mirrors
// skillMiddleware's shape (list what's available in the system prompt, give
// a tool to act on one of them), but for whole agents instead of skill docs.
//
// Only attached to the default agent (see agent.ts) — named agents don't get
// this middleware, so delegation can't chain into a loop (agent A delegating
// to agent B delegating back to A, etc). Because delegation only ever
// happens FROM the default agent, the incoming thread id here is always the
// default-agent form ("device:<name>:<chatId>"), never an "agent:" form —
// parsed.rest below is therefore always a safe, un-prefixed chatId to hand
// to callNamedAgent.
export const agentDelegationMiddleware = createMiddleware({
    name: "agentDelegationMiddleware",
    tools: [
        tool(
            async ({ agentName, task }: { agentName: string; task: string }, config) => {
                console.log(`[delegate_to_agent] -> ${agentName}: ${task}`);
                const threadId = config?.configurable?.thread_id as string | undefined;
                const parsed = threadId ? parseDeviceThreadId(threadId) : undefined;
                if (!parsed) {
                    return `Could not delegate to '${agentName}': could not determine which device this conversation belongs to.`;
                }
                try {
                    return await callNamedAgent(parsed.device, agentName, task, parsed.rest);
                } catch (err: any) {
                    const available = listAgentHeaders().map((h) => h.name).join(", ") || "(none configured)";
                    return `Could not delegate to '${agentName}': ${err?.message || err}. Available agents: ${available}`;
                }
            },
            {
                name: "delegate_to_agent",
                description: "Hand off a task to a specialized agent that's better suited to it than you are — see the Available Agents list in your system prompt for what's available and what each is for. Prefer this over attempting a task yourself when it clearly matches one of those agents' descriptions.",
                schema: z.object({
                    agentName: z.string().describe("The name of the agent to delegate to (see Available Agents)"),
                    task: z.string().describe("The task or message to send to that agent, with enough detail for it to act without further context"),
                }),
            }
        ),
    ],
    wrapModelCall: async (request, handler) => {
        const headers = listAgentHeaders();
        if (headers.length === 0) {
            return handler(request);
        }

        const agentsAddendum =
            `\n\n## Available Agents\n\n` +
            headers.map((h) => `- **${h.name}**: ${h.description}`).join("\n") +
            `\n\nIf the user's request is a better match for one of these agents than a general ` +
            `task, use the delegate_to_agent tool to hand it off rather than attempting it ` +
            `yourself. Otherwise, handle the request directly as usual.`;

        // Same systemMessage-not-systemPrompt caveat as skillMiddleware — see
        // its comment for why.
        return handler({
            ...request,
            systemMessage: request.systemMessage.concat(agentsAddendum),
        });
    },
});
```

- [ ] **Step 4: Verify named agents still load (requires `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`, e.g. via `.env`)**

Run:
```
cd whatsap && node -e "
import('./named-agents.ts').then((m) => {
  console.log('agents:', m.listAvailableAgents());
  console.log('headers:', JSON.stringify(m.listAgentHeaders()));
}).catch(e => { console.error('ERROR:', e); process.exit(1); });
"
```
Expected: same 4 agents as before (`math-coach`, `story-coach`, `system-design-coach`, `task-scheduler`), no error.

- [ ] **Step 5: Commit**

```bash
cd whatsap && git add agent.ts named-agents.ts middleware/agent-delegation-middleware.ts && git commit -m "refactor: agent.ts/named-agents.ts become per-device agent instance caches"
```

---

### Task 6: Device-aware `get_current_chat` and scheduling tools

**Files:**
- Modify: `whatsap/tools/get-current-chat.tool.ts`
- Modify: `whatsap/tools/create-scheduled-task.tool.ts`
- Modify: `whatsap/tools/list-scheduled-tasks.tool.ts`
- Modify: `whatsap/tools/cancel-scheduled-task.tool.ts`

- [ ] **Step 1: Update `get_current_chat`**

Replace the full contents of `whatsap/tools/get-current-chat.tool.ts` with:

```typescript
import { tool } from "langchain";
import { z } from "zod";
import { getWhatsAppClient } from "../lib/whatsapp-client.ts";
import { parseDeviceThreadId } from "../lib/devices.ts";

// Extracts the chat id out of whatever's left after the "device:<name>:"
// prefix has already been parsed off by parseDeviceThreadId. Named-agent
// thread ids are namespaced "agent:<agentName>:<chatId>" (see
// named-agents.ts's callNamedAgent) — strip that prefix to get back the
// raw WhatsApp chat id. Scheduled-task thread ids ("scheduled:<taskName>:
// <timestamp>", see scheduler.ts) aren't a real chat id at all — there's
// no "current chat" concept in that context, only the task's own fixed
// destination-chat, so this deliberately doesn't try to resolve those.
function extractChatId(rest: string): string | undefined {
    if (rest.startsWith("scheduled:")) return undefined;
    const match = rest.match(/^agent:[^:]+:(.+)$/);
    return match ? match[1] : rest;
}

export const getCurrentChatTool = tool(
    async (_input, config) => {
        const threadId = config?.configurable?.thread_id as string | undefined;
        if (!threadId) {
            return "Could not determine the current chat: no conversation context available.";
        }

        const parsed = parseDeviceThreadId(threadId);
        if (!parsed) {
            return "Could not determine the current chat: no device context available.";
        }

        const chatId = extractChatId(parsed.rest);
        if (!chatId) {
            return "There is no 'current chat' in this context (this is a scheduled task run, not a live conversation) — the destination chat must already be fixed on the task itself.";
        }

        const client = getWhatsAppClient(parsed.device);
        const name: string | undefined = await client.pupPage!.evaluate((id: string) => {
            // @ts-ignore - window.Store is injected by whatsapp-web.js, not typed
            const chat = window.Store.Chat.get(window.Store.WidFactory.createWid(id));
            if (!chat) return undefined;
            return chat.isGroup ? `${chat.formattedTitle || chat.name} (group)` : (chat.formattedTitle || chat.name);
        }, chatId);

        return name
            ? `The current chat/channel is: ${name}`
            : `Could not resolve a display name for the current chat (id: ${chatId}).`;
    },
    {
        name: "get_current_chat",
        description:
            "Get the name of the chat/channel/group this conversation is currently happening in. Use this " +
            "whenever the user refers to 'this chat', 'the current chat', 'current group', or 'current channel' " +
            "instead of asking them to name it. Returns an explanatory message instead of a name if there's no " +
            "current chat available in this context (e.g. during a scheduled task run, which has no live " +
            "conversation) — in that case, ask the user instead.",
        schema: z.object({}),
    }
);
```

- [ ] **Step 2: Update `create_scheduled_task`**

In `whatsap/tools/create-scheduled-task.tool.ts`, change the import line:

```typescript
import { slugify, writeNewTask, type ScheduledTask } from "../lib/tasks.ts";
```

to:

```typescript
import { slugify, writeNewTask, type ScheduledTask } from "../lib/tasks.ts";
import { parseDeviceThreadId } from "../lib/devices.ts";
```

Change the tool's `async (...) => {` signature to also accept `config`, and add a device check as the very first validation (before the `description` check):

```typescript
    async ({ description, scheduleType, schedule, timezone, targetAgent, destinationChat, createdByChat, body }, config) => {
        const threadId = config?.configurable?.thread_id as string | undefined;
        const parsed = threadId ? parseDeviceThreadId(threadId) : undefined;
        if (!parsed) {
            return "Cannot create task: could not determine which device this task belongs to.";
        }

        if (!description || description.trim().length < 10) {
```

Then change every call that referenced `slugify(description)` / `writeNewTask(task)` to pass `parsed.device` as the first argument:

```typescript
        const name = slugify(parsed.device, description);
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
        writeNewTask(parsed.device, task);
```

- [ ] **Step 3: Update `list_scheduled_tasks`**

Replace the full contents of `whatsap/tools/list-scheduled-tasks.tool.ts` with:

```typescript
import { tool } from "langchain";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { tasksDir } from "../lib/tasks.ts";
import { parseDeviceThreadId } from "../lib/devices.ts";

export const listScheduledTasksTool = tool(
    async (_input, config) => {
        const threadId = config?.configurable?.thread_id as string | undefined;
        const parsed = threadId ? parseDeviceThreadId(threadId) : undefined;
        if (!parsed) {
            return "Cannot list tasks: could not determine which device this conversation belongs to.";
        }

        const indexPath = path.join(tasksDir(parsed.device), "index.md");
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

- [ ] **Step 4: Update `cancel_scheduled_task`**

Replace the full contents of `whatsap/tools/cancel-scheduled-task.tool.ts` with:

```typescript
import { tool } from "langchain";
import { z } from "zod";
import { archiveTask } from "../lib/tasks.ts";
import { parseDeviceThreadId } from "../lib/devices.ts";

export const cancelScheduledTaskTool = tool(
    async ({ name }, config) => {
        const threadId = config?.configurable?.thread_id as string | undefined;
        const parsed = threadId ? parseDeviceThreadId(threadId) : undefined;
        if (!parsed) {
            return "Could not cancel task: could not determine which device this conversation belongs to.";
        }
        try {
            archiveTask(parsed.device, name, "cancelled");
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

- [ ] **Step 5: Verify the tools load and validate correctly**

Run (scratch cwd, matching the existing tool-verification pattern):
```
cd /tmp && rm -rf tool-check && mkdir tool-check && cd tool-check && node -e "
process.chdir('/tmp/tool-check');
import('/mnt/data/sources/agents-voice/whatsap/tools/create-scheduled-task.tool.ts').then(async (m) => {
  const noDevice = await m.createScheduledTaskTool.invoke({
    description: 'Sends a WhatsApp reminder to the chat it was created in every Monday.',
    scheduleType: 'recurring', schedule: '0 9 * * MON', targetAgent: 'default',
    destinationChat: '@jlabrada71', body: 'Say good morning.',
  }, {});
  console.log('no device context:', noDevice);

  const withDevice = await m.createScheduledTaskTool.invoke({
    description: 'Sends a WhatsApp reminder to the chat it was created in every Monday.',
    scheduleType: 'recurring', schedule: '0 9 * * MON', targetAgent: 'default',
    destinationChat: '@jlabrada71', body: 'Say good morning.',
  }, { configurable: { thread_id: 'device:primary:554800000000@c.us' } });
  console.log('with device context:', withDevice);
  console.log(require('node:fs').readFileSync('devices/primary/tasks/index.md', 'utf-8'));
});
"
```
Expected: `no device context` returns the "could not determine which device" message; `with device context` creates the task under `devices/primary/tasks/`.

Clean up: `rm -rf /tmp/tool-check`

- [ ] **Step 6: Commit**

```bash
cd whatsap && git add tools/get-current-chat.tool.ts tools/create-scheduled-task.tool.ts tools/list-scheduled-tasks.tool.ts tools/cancel-scheduled-task.tool.ts && git commit -m "refactor: scheduling tools and get_current_chat parse device from thread id"
```

---

### Task 7: Device-aware `scheduler.ts`

**Files:**
- Modify: `whatsap/scheduler.ts`
- Modify: `whatsap/scheduler.test.ts`

- [ ] **Step 1: Rewrite the module**

Replace the full contents of `whatsap/scheduler.ts` with:

```typescript
// scheduler.ts
//
// Polls every device's devices/<device>/tasks/ every SCHEDULER_POLL_INTERVAL_MS
// and fires anything due, independently per device — one device's
// stuck/erroring task never blocks another device's. Started from index.ts
// once devices are booted (needs each device's own client for chat-name
// resolution and delivery — see resolveChatIdByName/fireTask below).

import { CronExpressionParser } from "cron-parser";
import { callAgent, callNamedAgent } from "./agent.ts";
import { sendAgentResponse } from "./lib/send-agent-response.ts";
import { listActiveTaskNames, readTask, updateLastRun, archiveTask, readTaskMemory, taskMemoryDir, type ScheduledTask } from "./lib/tasks.ts";

const POLL_INTERVAL_MS = process.env.SCHEDULER_POLL_INTERVAL_MS
    ? Number(process.env.SCHEDULER_POLL_INTERVAL_MS)
    : 60000;

// Guards against a slow agent call overlapping the next tick, per device —
// a Set instead of a single boolean since devices poll independently.
const pollingDevices = new Set<string>();

export interface DeviceHandle {
    name: string;
    client: any;
}

// `devices` is read fresh on every tick (via .forEach on whatever array is
// passed in) — index.ts mutates this same array in place as new devices
// come online via the onboarding poller, so newly added devices are picked
// up automatically without restarting this interval.
export function startScheduler(devices: DeviceHandle[]): void {
    console.log(`[scheduler] started, polling every ${POLL_INTERVAL_MS}ms`);
    setInterval(() => {
        devices.forEach((d) => void pollOnce(d.name, d.client));
    }, POLL_INTERVAL_MS);
}

async function pollOnce(deviceName: string, client: any): Promise<void> {
    if (pollingDevices.has(deviceName)) return;
    pollingDevices.add(deviceName);
    try {
        for (const name of listActiveTaskNames(deviceName)) {
            const task = readTask(deviceName, name);
            if (!task || task.status !== "active") continue;
            try {
                if (isDue(task)) {
                    console.log(`[scheduler] [${deviceName}] firing task '${task.name}'`);
                    await fireTask(deviceName, client, task);
                }
            } catch (err) {
                // Left last-run/location untouched on purpose — retried
                // next poll, no dead-letter mechanism.
                console.error(`[scheduler] [${deviceName}] task '${task.name}' failed:`, err);
            }
        }
    } finally {
        pollingDevices.delete(deviceName);
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

// Wraps a recurring task's body with its prior continuity notes (if any)
// and a write-back instruction, so the agent has explicit, curated context
// instead of relying on conversation history that no longer persists across
// firings (see fireTask's threadId below). One-off tasks never call this —
// they have no continuity concept at all.
export function buildRecurringPrompt(deviceName: string, task: ScheduledTask, priorNotes: string | undefined): string {
    const memoryPath = `${taskMemoryDir(deviceName)}/${task.name}.md`;
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

// Tolerant of a missing/extra leading "@" and case differences — a
// destination-chat value typed or generated by an LLM (see
// tools/create-scheduled-task.tool.ts) commonly drops the "@" a display
// name like "@jlabrada71" starts with (it reads as an @-mention), and an
// exact-match comparison would otherwise silently fail delivery.
function normalizeChatName(name: string): string {
    return name.trim().replace(/^@/, "").toLowerCase();
}

async function resolveChatIdByName(client: any, name: string): Promise<string | undefined> {
    // Same window.Store.Chat.getModelsArray() approach bot.ts's "list
    // channels" command uses, reversed: name -> id instead of id -> name.
    const chats: { name: string; id: string }[] = await client.pupPage!.evaluate(() => {
        // @ts-ignore - window.Store is injected by whatsapp-web.js, not typed
        return window.Store.Chat.getModelsArray().map((chat: any) => ({
            name: chat.isGroup ? `${chat.formattedTitle || chat.name} (group)` : chat.formattedTitle || chat.name || chat.id.user,
            id: chat.id._serialized,
        }));
    });
    const target = normalizeChatName(name);
    return chats.find((c) => normalizeChatName(c.name) === target)?.id;
}

async function fireTask(deviceName: string, client: any, task: ScheduledTask): Promise<void> {
    const chatId = await resolveChatIdByName(client, task.destinationChat);
    if (!chatId) {
        throw new Error(`destination chat '${task.destinationChat}' not found`);
    }

    // A fresh, unique local thread id every single firing — never reused
    // across runs of the same task (agent.ts/named-agents.ts wrap this in
    // the device: prefix internally). This is the actual fix for the
    // exceed_context_size_error crash: a fixed id let raw tool-call history
    // accumulate forever across firings. Continuity a recurring task needs
    // comes from the explicit tasks/memory/ file instead.
    const localThreadId = `scheduled:${task.name}:${Date.now()}`;

    const body =
        task.scheduleType === "recurring" ? buildRecurringPrompt(deviceName, task, readTaskMemory(deviceName, task.name)) : task.body;

    const response =
        task.targetAgent === "default"
            ? await callAgent(deviceName, body, localThreadId)
            : await callNamedAgent(deviceName, task.targetAgent, body, localThreadId);

    await sendAgentResponse(client, chatId, response);

    if (task.scheduleType === "once") {
        archiveTask(deviceName, task.name, "completed");
    } else {
        updateLastRun(deviceName, task.name, new Date().toISOString());
    }
}
```

- [ ] **Step 2: Update the tests**

In `whatsap/scheduler.test.ts`, change the import line:

```typescript
import { isDue, buildRecurringPrompt } from "./scheduler.ts";
```

stays the same signature-wise for `isDue` (unchanged), but `buildRecurringPrompt` now takes a leading `deviceName`. Update its two test cases:

```typescript
describe("buildRecurringPrompt", () => {
    const recurringTask = task({ name: "daily-news", scheduleType: "recurring", body: "Summarize today's news." });

    it("includes a first-run note and write-back instruction when there are no prior notes", () => {
        const prompt = buildRecurringPrompt("primary", recurringTask, undefined);
        expect(prompt).toContain("Summarize today's news.");
        expect(prompt).toContain("first run of this recurring task");
        expect(prompt).toContain("devices/primary/tasks/memory/daily-news.md");
    });

    it("includes prior notes and the task body when notes exist", () => {
        const prompt = buildRecurringPrompt("primary", recurringTask, "Yesterday covered topic X.");
        expect(prompt).toContain("Yesterday covered topic X.");
        expect(prompt).toContain("Summarize today's news.");
        expect(prompt).toContain("## Notes from previous runs");
        expect(prompt).toContain("## This run's task");
    });
});
```

(The `isDue` describe block above it is unchanged — `isDue` didn't gain a device parameter, since it's a pure function over a task object with no filesystem access.)

- [ ] **Step 3: Run the tests**

Run: `cd whatsap && pnpm test scheduler.test.ts`
Expected: all 7 tests pass (5 `isDue` + 2 `buildRecurringPrompt`).

- [ ] **Step 4: Commit**

```bash
cd whatsap && git add scheduler.ts scheduler.test.ts && git commit -m "refactor: scheduler.ts polls every device independently"
```

---

### Task 8: Device onboarding poller (`device-onboarding.ts`)

**Files:**
- Create: `whatsap/device-onboarding.ts`

- [ ] **Step 1: Write the module**

```typescript
// device-onboarding.ts
//
// Picks up new-devices/<name>.md drops and materializes them under
// devices/<name>/ — see docs/superpowers/specs/2026-09-08-multi-device-support-design.md's
// "Device Onboarding" section. A device becomes usable without restarting
// the whatsap container: the Nuxt UI (a later plan) writes directly to the
// shared new-devices/ volume; this poller (plus a one-time startup pass)
// is what turns that into a running bot.

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter, parseMetadataField } from "./middleware/frontmatter.ts";
import { DEVICES_DIR, validateDeviceName, type DeviceConfig } from "./lib/devices.ts";

const NEW_DEVICES_DIR = "./new-devices";
const POLL_INTERVAL_MS = process.env.DEVICE_ONBOARDING_POLL_INTERVAL_MS
    ? Number(process.env.DEVICE_ONBOARDING_POLL_INTERVAL_MS)
    : 5000;

interface PendingDevice {
    name: string;
    label: string;
}

function listPendingDeviceNames(): string[] {
    if (!existsSync(NEW_DEVICES_DIR)) return [];
    return readdirSync(NEW_DEVICES_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => e.name.replace(/\.md$/, ""));
}

function readPendingDevice(fileBaseName: string): PendingDevice | undefined {
    const filePath = path.join(NEW_DEVICES_DIR, `${fileBaseName}.md`);
    if (!existsSync(filePath)) return undefined;
    const { metadata } = parseFrontmatter(readFileSync(filePath, "utf-8"));
    return {
        name: parseMetadataField(metadata, "name") || fileBaseName,
        label: parseMetadataField(metadata, "label") || fileBaseName,
    };
}

// Creates the full devices/<name>/ subtree for a newly onboarded device:
// device.md, session/, memory/, tasks/ (with archive/ and memory/, and
// seeded index.md files matching the empty-state format lib/tasks.ts's
// regenerateIndex produces).
function materializeDevice(name: string, label: string): DeviceConfig {
    const deviceDir = path.join(DEVICES_DIR, name);
    mkdirSync(path.join(deviceDir, "session"), { recursive: true });
    mkdirSync(path.join(deviceDir, "memory"), { recursive: true });
    mkdirSync(path.join(deviceDir, "tasks", "archive"), { recursive: true });
    mkdirSync(path.join(deviceDir, "tasks", "memory"), { recursive: true });
    writeFileSync(path.join(deviceDir, "tasks", "index.md"), "# Active Tasks\n\n(No tasks.)\n", "utf-8");
    writeFileSync(path.join(deviceDir, "tasks", "archive", "index.md"), "# Archived Tasks\n\n(No tasks.)\n", "utf-8");
    writeFileSync(
        path.join(deviceDir, "device.md"),
        `---\nname: ${name}\nlabel: ${label}\nstatus: active\n---\n\n${label}\n`,
        "utf-8"
    );
    return { name, label, status: "active" };
}

// Picks up every pending request under new-devices/, materializes it under
// devices/, deletes the pending file, and calls onDeviceReady for each so
// the caller (index.ts) can start its bot and register it with the
// scheduler — used both at startup (to recover anything left over from a
// prior restart) and on every poll tick thereafter. A malformed pending
// file (fails validation) is logged and left in place rather than deleted,
// so it doesn't silently vanish.
export function pickUpPendingDevices(onDeviceReady: (device: DeviceConfig) => void): void {
    for (const fileBaseName of listPendingDeviceNames()) {
        try {
            const pending = readPendingDevice(fileBaseName);
            if (!pending || !validateDeviceName(pending.name)) {
                console.error(`[device-onboarding] invalid pending device '${fileBaseName}', leaving in place`);
                continue;
            }
            const device = materializeDevice(pending.name, pending.label);
            unlinkSync(path.join(NEW_DEVICES_DIR, `${fileBaseName}.md`));
            console.log(`[device-onboarding] onboarded device '${device.name}'`);
            onDeviceReady(device);
        } catch (err) {
            console.error(`[device-onboarding] failed to onboard '${fileBaseName}':`, err);
        }
    }
}

export function startDeviceOnboardingPoller(onDeviceReady: (device: DeviceConfig) => void): void {
    setInterval(() => pickUpPendingDevices(onDeviceReady), POLL_INTERVAL_MS);
}
```

- [ ] **Step 2: Verify in isolation**

Run (scratch cwd):
```
mkdir -p /tmp/onboarding-check && cd /tmp/onboarding-check
mkdir -p new-devices
cat > new-devices/business.md << 'EOF'
---
name: business
label: Business Line
---
EOF
node -e "
process.chdir('/tmp/onboarding-check');
import('/mnt/data/sources/agents-voice/whatsap/device-onboarding.ts').then((m) => {
  const ready = [];
  m.pickUpPendingDevices((d) => ready.push(d));
  console.log('ready:', JSON.stringify(ready));
  console.log('pending file gone:', !require('node:fs').existsSync('new-devices/business.md'));
  console.log('device.md:', require('node:fs').readFileSync('devices/business/device.md', 'utf-8'));
  console.log('tasks/index.md:', require('node:fs').readFileSync('devices/business/tasks/index.md', 'utf-8'));
});
"
```
Expected: `ready` contains the materialized `{name: "business", label: "Business Line", status: "active"}`, the pending file is gone, and the full `devices/business/` subtree exists with correct seed content.

Clean up: `rm -rf /tmp/onboarding-check`

- [ ] **Step 3: Commit**

```bash
cd whatsap && git add device-onboarding.ts && git commit -m "feat: add device onboarding poller (new-devices/ pickup)"
```

---

### Task 9: `bot.ts` (extracted from `index.ts`) and the new thin `index.ts`

**Files:**
- Create: `whatsap/bot.ts`
- Modify: `whatsap/index.ts`

- [ ] **Step 1: Write `bot.ts`**

```typescript
// bot.ts
//
// Per-device WhatsApp client + message handling — extracted from index.ts
// so multiple devices can each get their own Client instance sharing the
// same agent/tool/scheduler backend (see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md).

import whatsapp from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import fs from 'fs'
import path from 'path'

import { callAgent, callNamedAgent, listAvailableAgents, clearSession } from './agent.ts'
import { sendAgentResponse } from './lib/send-agent-response.ts'
import { archiveTask, tasksDir } from './lib/tasks.ts'
import { setWhatsAppClient } from './lib/whatsapp-client.ts'
import type { DeviceConfig } from './lib/devices.ts'

const { Client, LocalAuth } = whatsapp

const STT_URL = process.env.STT_URL || 'http://localhost:8001';

// Chats whose voice notes get transcribed and forwarded to the default agent
// automatically, without needing an "@ai" prefix (voice notes have no text
// body to prefix). Matched against the chat's display name, as shown by
// "@ai list channels". Shared across every device via one env var — if a
// later need arises for per-device STT allowlists, this can move into
// device.md, but nothing in this project's usage needs that distinction yet.
const STT_ALLOWED_CHATS: string[] = process.env.STT_ALLOWED_CHATS
    ? process.env.STT_ALLOWED_CHATS.split(',').map((name) => name.trim()).filter(Boolean)
    : ['@jlabrada71'];

async function getChatNameById(client: any, chatId: string): Promise<string | undefined> {
    // Not using client.getChatById()/message.getChat() here: for self-chat
    // messages (fromMe with no reliable `.to`), whatsapp-web.js's internal
    // _getChatId() can resolve to an invalid id and throw deep inside its
    // page-injected code (same class of fragile internal-Store failure as
    // the getChats() bug worked around in "list channels" below). chatId
    // is always reliably populated here, so read the name directly off the
    // chat store instead.
    return client.pupPage!.evaluate((id: string) => {
        // @ts-ignore - window.Store is injected by whatsapp-web.js, not typed
        const chat = window.Store.Chat.get(window.Store.WidFactory.createWid(id));
        return chat ? (chat.formattedTitle || chat.name) : undefined;
    }, chatId);
}

async function downloadAudioMedia(client: any, message: any): Promise<{ data: string; mimetype: string } | undefined> {
    // Not using message.downloadMedia() here: it re-fetches the message from
    // WhatsApp Web's internal IndexedDB store by id before decrypting, and
    // that lookup throws ("DataError: ... No key or key range specified")
    // for this self-chat's @lid-addressed messages — the same class of
    // fragile internal-Store failure worked around elsewhere in this file.
    // message.rawData (aka message._data) already has every field the
    // decrypt step needs, snapshotted client-side when the event fired, so
    // skip the re-fetch and decrypt directly from that.
    const raw = message.rawData;
    const result = await client.pupPage!.evaluate(async (raw: any) => {
        try {
            const mockQpl = {
                addAnnotations() { return this; },
                addPoint() { return this; },
            };
            // @ts-ignore - window.Store/WWebJS are injected by whatsapp-web.js, not typed
            const decrypted = await window.Store.DownloadManager.downloadAndMaybeDecrypt({
                directPath: raw.directPath,
                encFilehash: raw.encFilehash,
                filehash: raw.filehash,
                mediaKey: raw.mediaKey,
                mediaKeyTimestamp: raw.mediaKeyTimestamp,
                type: raw.type,
                signal: (new AbortController()).signal,
                downloadQpl: mockQpl,
            });
            // @ts-ignore
            const data = await window.WWebJS.arrayBufferToBase64Async(decrypted);
            return { data, mimetype: raw.mimetype };
        } catch (e: any) {
            return { __error: e?.message || String(e) };
        }
    }, raw);

    if (!result || '__error' in result) {
        console.error('[debug] downloadAudioMedia failed:', (result as any)?.__error);
        return undefined;
    }
    return result as { data: string; mimetype: string };
}

async function transcribeAudio(media: { data: string; mimetype: string }): Promise<string> {
    const audioBuffer = Buffer.from(media.data, 'base64');
    const form = new FormData();
    form.append('audio', new Blob([audioBuffer], { type: media.mimetype || 'application/octet-stream' }), 'audio');

    const res = await fetch(`${STT_URL}/stt`, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error(`STT request failed: ${res.status} ${await res.text()}`);
    }
    const { text } = await res.json() as { text: string };
    return text;
}

// Per-device raw-event log (was a single shared logs.txt before devices
// existed) — same append-only JSON-dump behavior, just scoped under this
// device's own directory.
function logToFile(deviceName: string, data: unknown) {
    const logFilePath = path.join('devices', deviceName, 'logs.txt');
    fs.appendFile(logFilePath, JSON.stringify(data, null, 2), (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
}

export function createDeviceBot(device: DeviceConfig): any {
    const deviceName = device.name;

    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: path.join('devices', deviceName, 'session'),
            clientId: deviceName,
        }),
        puppeteer: {
            // Chromium has no usable sandbox when running as root in a container.
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    });

    // Makes this client reachable from tools/get-current-chat.tool.ts and
    // scheduler.ts, both of which are set up before this client exists.
    setWhatsAppClient(deviceName, client);

    client.on('ready', () => {
        console.log(`[${deviceName}] Client is ready!`);
    });

    client.on('qr', (qr) => {
        // Known limitation of this plan: with multiple devices needing
        // linking around the same time, their QR output can interleave in
        // one terminal — an internal API + web UI (a later plan) replaces
        // this. Prefixed with the device name so it's at least attributable.
        console.log(`[${deviceName}] scan this QR code:`);
        qrcode.generate(qr, { small: true });
    });

    // Visibility into the connection lifecycle beyond just 'qr'/'ready' —
    // useful for diagnosing a stuck or dropped session without needing to
    // patch in diagnostics again.
    client.on('loading_screen', (percent, message) => {
        console.log(`[${deviceName}] [diag] loading_screen:`, percent, message);
    });
    client.on('change_state', (state) => {
        console.log(`[${deviceName}] [diag] change_state:`, state);
    });
    client.on('authenticated', () => {
        console.log(`[${deviceName}] [diag] authenticated`);
    });
    client.on('auth_failure', (msg) => {
        console.log(`[${deviceName}] [diag] auth_failure:`, msg);
    });
    client.on('disconnected', (reason) => {
        console.log(`[${deviceName}] [diag] disconnected:`, reason);
    });

    const debug = true;
    const MESSAGE = debug ? 'message_create' : 'message';

    client.on(MESSAGE, async (message: any) => {
        logToFile(deviceName, '---- message event ----');
        logToFile(deviceName, message);
        console.log(`[${deviceName}] ---- message-create event ----`);
        console.log(`[${deviceName}] [debug] body:`, JSON.stringify(message.body), 'from:', message.from);

        // WhatsApp's own convention: the chat this message belongs to is `.to`
        // when the account sent it (fromMe), `.from` otherwise — e.g. for a
        // self-chat message, `.from` is the account's legacy phone-based id but
        // `.to` is its modern @lid chat id, and only the latter actually
        // resolves in the chat store or reliably keys conversation memory
        // across a self-chat session. Computed once here and used for every
        // send target / thread id below, instead of raw message.from.
        const chatId = message.fromMe ? message.to : message.from;

        if (message.body === '!ping') {
            // send back "pong" to the chat the message was sent in
            client.sendMessage(chatId, 'pong');
            // reply back "pong" directly to the message
            message.reply('pong');
        }

        if (message.hasMedia && (message.type === 'ptt' || message.type === 'audio')) {
            try {
                const chatName = await getChatNameById(client, chatId);
                if (chatName && STT_ALLOWED_CHATS.includes(chatName)) {
                    console.log(`[${deviceName}] [debug] audio message received in '${chatName}' (stt-allowed), transcribing...`);
                    const media = await downloadAudioMedia(client, message);
                    if (!media) {
                        await message.reply('Sorry, I could not download that audio.');
                    } else {
                        const transcript = await transcribeAudio(media);
                        console.log(`[${deviceName}] [debug] transcript:`, transcript);
                        const response = await callAgent(deviceName, transcript, chatId);
                        console.log(`[${deviceName}] [debug] agent response:`, response);
                        await sendAgentResponse(client, chatId, response);
                    }
                }
            } catch (err) {
                console.error(`[${deviceName}] [debug] audio-to-agent flow failed:`, err);
                await message.reply('Sorry, something went wrong transcribing that audio.');
            }
        }

        if (message.body.startsWith('@ai')) {
            const request = message.body.replace('@ai', '').trim();
            console.log(`[${deviceName}] [debug] @ai request received:`, request);

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
            } else if (request.toLowerCase() === 'clear session') {
                try {
                    await clearSession(deviceName, chatId);
                    await message.reply('Session cleared — starting fresh with every agent in this chat.');
                } catch (err) {
                    console.error(`[${deviceName}] [debug] clear session failed:`, err);
                    await message.reply('Sorry, something went wrong clearing the session.');
                }
            } else if (request.toLowerCase() === 'list channels') {
                try {
                    // Not using client.getChats() here: it fetches full live group
                    // metadata for every group chat in one Promise.all with no
                    // per-chat error handling, so a single failing group (rate
                    // limit, stale metadata, etc.) throws and kills the whole
                    // list. We only need names, so read them directly off the
                    // chat store instead.
                    const names: string[] = await client.pupPage!.evaluate(() => {
                        // @ts-ignore - window.Store is injected by whatsapp-web.js, not typed
                        return window.Store.Chat.getModelsArray().map((chat: any) =>
                            chat.isGroup ? `${chat.formattedTitle || chat.name} (group)` : (chat.formattedTitle || chat.name || chat.id.user)
                        );
                    });
                    await message.reply(names.length > 0 ? `Available channels:\n${names.join('\n')}` : 'No channels found.');
                } catch (err) {
                    console.error(`[${deviceName}] [debug] list channels failed:`, err);
                    await message.reply('Sorry, something went wrong listing channels.');
                }
            } else if (request.toLowerCase() === 'list agents') {
                const agents = listAvailableAgents();
                await message.reply(agents.length > 0 ? `Available agents:\n${agents.join('\n')}` : 'No agents found.');
            } else if (request.toLowerCase() === 'list tasks') {
                try {
                    const indexPath = path.join(tasksDir(deviceName), 'index.md');
                    const content = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : 'No scheduled tasks yet.';
                    await message.reply(content);
                } catch (err) {
                    console.error(`[${deviceName}] [debug] list tasks failed:`, err);
                    await message.reply('Sorry, something went wrong listing tasks.');
                }
            } else if (/^cancel task\b/i.test(request)) {
                const cancelMatch = request.match(/^cancel task\s+(\S+)/i);
                const taskName = cancelMatch?.[1];
                if (!taskName) {
                    await message.reply('Usage: @ai cancel task <name>');
                } else {
                    try {
                        archiveTask(deviceName, taskName, 'cancelled via @ai cancel task');
                        await message.reply(`Task '${taskName}' cancelled and archived.`);
                    } catch (err) {
                        console.error(`[${deviceName}] [debug] cancel task '${taskName}' failed:`, err);
                        await message.reply(`Could not cancel task '${taskName}': ${(err as any)?.message || 'not found'}`);
                    }
                }
            } else if (/^schedule\b/i.test(request)) {
                const scheduleText = request.replace(/^schedule\s*/i, '').trim();
                if (!scheduleText) {
                    await message.reply('Usage: @ai schedule <describe the task and when it should run>');
                } else {
                    try {
                        // task-scheduler resolves "this chat"/"current chat" itself
                        // via the get_current_chat tool — no need to inject a
                        // context hint here.
                        const response = await callNamedAgent(deviceName, 'task-scheduler', scheduleText, chatId);
                        console.log(`[${deviceName}] [debug] task-scheduler response:`, response);
                        await sendAgentResponse(client, chatId, response);
                    } catch (err) {
                        console.error(`[${deviceName}] [debug] schedule command failed:`, err);
                        await message.reply('Sorry, something went wrong creating that scheduled task.');
                    }
                }
            } else if (/^@agent\b/i.test(request)) {
                // "@ai @agent <agent name> <message>" routes to the named agent's
                // own system prompt from ./agents/<agent name>/agent.md instead
                // of the default one in prompts/executer-system.md.
                const agentMatch = request.match(/^@agent\s+(\S+)\s*([\s\S]*)$/i);
                const agentName = agentMatch?.[1];
                const agentMessage = agentMatch?.[2]?.trim();

                if (!agentName) {
                    await message.reply('Usage: @ai @agent <agent name> [message]');
                } else {
                    try {
                        const response = await callNamedAgent(deviceName, agentName, agentMessage || 'Hi', chatId);
                        console.log(`[${deviceName}] [debug] named agent response:`, response);
                        await sendAgentResponse(client, chatId, response);
                    } catch (err) {
                        console.error(`[${deviceName}] [debug] callNamedAgent('${agentName}') failed:`, err);
                        const available = listAvailableAgents();
                        await message.reply(
                            available.length > 0
                                ? `Agent '${agentName}' not found. Available agents: ${available.join(', ')}`
                                : `Agent '${agentName}' not found, and no agents are configured under ./agents.`
                        );
                    }
                }
            } else {
                try {
                    const response = await callAgent(deviceName, request, chatId);
                    console.log(`[${deviceName}] [debug] agent response:`, response);
                    await sendAgentResponse(client, chatId, response);
                } catch (err) {
                    console.error(`[${deviceName}] [debug] callAgent failed:`, err);
                    await message.reply('Sorry, something went wrong processing that request.');
                }
            }
        }

        if (message.notifyName === 'Diego Cobian') {
            console.log(`[${deviceName}] ---- message from Diego Cobian ----`);
            console.log(message.body);
        }
    });

    client.initialize();
    return client;
}
```

- [ ] **Step 2: Rewrite `index.ts` as a thin orchestrator**

Replace the full contents of `whatsap/index.ts` with:

```typescript
// index.ts
//
// Multi-device orchestrator: boots a bot (see bot.ts) for every already-
// configured device, recovers/onboards anything pending in new-devices/,
// starts the shared scheduler across all of them, and keeps the onboarding
// poller running so new devices can come online without a restart — see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md.

import { createDeviceBot } from './bot.ts'
import { listDeviceNames, readDevice, type DeviceConfig } from './lib/devices.ts'
import { pickUpPendingDevices, startDeviceOnboardingPoller } from './device-onboarding.ts'
import { startScheduler, type DeviceHandle } from './scheduler.ts'

// Mutated in place (never reassigned) as devices come online, including
// after startup via the onboarding poller — scheduler.ts's setInterval
// closes over this same array reference, so it sees new devices on its
// very next tick without any extra wiring.
const activeDevices: DeviceHandle[] = [];

function bootDevice(device: DeviceConfig): void {
    if (device.status !== 'active') return;
    if (activeDevices.some((d) => d.name === device.name)) return;
    const client = createDeviceBot(device);
    activeDevices.push({ name: device.name, client });
}

// Recover anything left over from a prior restart before processing
// already-onboarded devices, so both paths converge on the same
// bootDevice()/createDeviceBot() call before the scheduler starts.
pickUpPendingDevices(bootDevice);

for (const name of listDeviceNames()) {
    const device = readDevice(name);
    if (device) bootDevice(device);
}

startScheduler(activeDevices);
startDeviceOnboardingPoller(bootDevice);
```

- [ ] **Step 3: Confirm no leftover references to the old single-client shape**

Run: `cd whatsap && grep -rn "setWhatsAppClient(client)\|getWhatsAppClient()\|import { memoryMiddleware }" --include="*.ts" . | grep -v node_modules | grep -v "\.test\.ts"`
Expected: no matches — every call site now passes a device name, and nothing still imports the old singleton (the internal `name: "memoryMiddleware"` debug label inside `middleware/memory-middleware.ts` itself is expected and unrelated — this check is specifically for the old *import* pattern, not that string).

- [ ] **Step 4: Commit**

```bash
cd whatsap && git add bot.ts index.ts && git commit -m "refactor: extract per-device bot logic into bot.ts, index.ts becomes a multi-device orchestrator"
```

---

### Task 10: Migrate existing data to `devices/primary/`

**Files:**
- Move: `whatsap/session/` → `whatsap/devices/primary/session/`
- Move: `whatsap/memory/` → `whatsap/devices/primary/memory/`
- Move: `whatsap/tasks/` → `whatsap/devices/primary/tasks/`
- Create: `whatsap/devices/primary/device.md`
- Modify: `/mnt/data/sources/agents-voice/docker-compose-whatsap.yml`

- [ ] **Step 1: Move the tracked directories with git, and the untracked one with plain `mv`**

```bash
cd whatsap
mkdir -p devices/primary
git mv memory devices/primary/memory
git mv tasks devices/primary/tasks
# session/ is gitignored (not tracked) — plain filesystem move
mv session devices/primary/session
```

- [ ] **Step 2: Create `devices/primary/device.md`**

```markdown
---
name: primary
label: Primary
status: active
---

Primary WhatsApp account — the original single-device setup, migrated to the
multi-device layout.
```

Save as `whatsap/devices/primary/device.md`.

- [ ] **Step 3: Update `docker-compose-whatsap.yml`'s `whatsap` service volumes**

In `/mnt/data/sources/agents-voice/docker-compose-whatsap.yml`, replace the existing four volume lines:

```yaml
      # Persist the authenticated WhatsApp Web session (LocalAuth credentials)
      # across container restarts — without this, every restart requires
      # re-scanning the QR code.
      - ./whatsap/session:/app/session
      # Append-only raw-event logs (contains message bodies/sender metadata).
      - ./whatsap/logs.txt:/app/logs.txt
      # web_search tool results/queries (see tools/web-search.tool.ts) —
      # excluded from the build context by whatsap/.dockerignore, so without
      # this mount they'd only exist in the container's ephemeral layer.
      - ./whatsap/research:/app/research
      # Persistent agent memory (see middleware/memory-middleware.ts) — a
      # memory/index.md pointing to individual memory files. Without this
      # mount, every image rebuild (which happens often during development)
      # would wipe everything the agent has remembered.
      - ./whatsap/memory:/app/memory
      # Rendered diagram images (see tools/render-diagram.tool.ts) — sent to
      # the user as WhatsApp media, then not needed again; persisted mainly
      # for debugging.
      - ./whatsap/diagrams:/app/diagrams
      # Scheduled tasks (see whatsap/scheduler.ts and lib/tasks.ts) — one
      # file per task under tasks/, archived tasks under tasks/archive/.
      # Without this mount, every image rebuild would wipe all schedules.
      - ./whatsap/tasks:/app/tasks
```

with:

```yaml
      # Per-device session, memory, and scheduled tasks (see
      # docs/superpowers/specs/2026-09-08-multi-device-support-design.md) —
      # devices/<name>/{session,memory,tasks}. Without this mount, every
      # image rebuild would wipe every device's auth session, memory, and
      # schedules.
      - ./whatsap/devices:/app/devices
      # Device-onboarding drop directory (see whatsap/device-onboarding.ts)
      # — a new device is created by writing new-devices/<name>.md here;
      # the running process picks it up without a restart.
      - ./whatsap/new-devices:/app/new-devices
      # web_search tool results/queries (see tools/web-search.tool.ts) —
      # excluded from the build context by whatsap/.dockerignore, so without
      # this mount they'd only exist in the container's ephemeral layer.
      - ./whatsap/research:/app/research
      # Rendered diagram images (see tools/render-diagram.tool.ts) — sent to
      # the user as WhatsApp media, then not needed again; persisted mainly
      # for debugging.
      - ./whatsap/diagrams:/app/diagrams
```

(The shared top-level `logs.txt` mount is removed — per-device logs now live at `devices/<name>/logs.txt`, inside the already-mounted `devices/` directory, so no separate mount is needed for it.)

- [ ] **Step 4: Create the `new-devices/` directory placeholder**

```bash
mkdir -p /mnt/data/sources/agents-voice/whatsap/new-devices
touch /mnt/data/sources/agents-voice/whatsap/new-devices/.gitkeep
```

- [ ] **Step 5: Update `.gitignore`**

In `whatsap/.gitignore`, change:
```
session/
```
to:
```
devices/*/session/
```

- [ ] **Step 6: Commit**

```bash
cd whatsap && git add devices/primary/device.md devices/primary/memory devices/primary/tasks new-devices/.gitkeep .gitignore && git commit -m "chore: migrate primary device to devices/primary/ layout"
```

(This commit intentionally does not touch `docker-compose-whatsap.yml`, since that file lives outside this git repository — its edit from Step 3 is saved to disk directly, same as every other change to it in this project's history.)

---

### Task 11: End-to-end verification against the running stack

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and restart the stack**

Run: `cd /mnt/data/sources/agents-voice && docker compose -f docker-compose-whatsap.yml up --build -d`
Expected: all services build and start; `whatsap` reconnects using the migrated `devices/primary/session` (no QR needed) — confirm via `docker compose -f docker-compose-whatsap.yml logs whatsap | grep -i "\[primary\] Client is ready"`.

- [ ] **Step 2: Regression-check the migrated `primary` device**

From WhatsApp: send `@ai list channels`, `@ai list tasks` (should show the two real tasks migrated from before — `daily-storytelling-prompt-sent-to-jlabrada71-chat` and `research-ai-news-daily-at-9-00-am-and-save-results`), and a normal chat message to the default agent. Confirm via `docker compose logs -f whatsap | grep '\[primary\]'` that everything responds exactly as it did before this refactor.

- [ ] **Step 3: Add a second device via the manual file-drop path**

```bash
mkdir -p /mnt/data/sources/agents-voice/whatsap/new-devices
cat > /mnt/data/sources/agents-voice/whatsap/new-devices/verify-second.md << 'EOF'
---
name: verify-second
label: Verification Device
---
EOF
```

Watch `docker compose -f docker-compose-whatsap.yml logs -f whatsap | grep -iE "device-onboarding|verify-second"` — expect, within `DEVICE_ONBOARDING_POLL_INTERVAL_MS` (default 5s): `[device-onboarding] onboarded device 'verify-second'`, a `[verify-second] scan this QR code:` block printed to the terminal, and `whatsap/devices/verify-second/` created with the full subtree (`device.md`, `session/`, `memory/`, `tasks/` with seeded `index.md`/`archive/index.md`).

- [ ] **Step 4: Confirm no container restart occurred during onboarding**

Run `docker compose -f docker-compose-whatsap.yml ps whatsap` before and after Step 3 — the `Up <duration>` value should show continuous uptime spanning both checks, not a reset.

- [ ] **Step 5: Confirm device isolation**

While `verify-second` is still just `pending` (not yet linked — no need to actually scan its QR for this check), confirm via `docker exec` that `devices/verify-second/tasks/` is empty and separate from `devices/primary/tasks/`:

```bash
docker exec agents-voice-whatsap-whatsap-1 ls /app/devices/primary/tasks /app/devices/verify-second/tasks
```

Expected: `primary`'s listing shows the real migrated tasks; `verify-second`'s shows only the seeded empty `index.md`/`archive/`.

- [ ] **Step 6: Clean up the verification device**

```bash
docker exec agents-voice-whatsap-whatsap-1 rm -rf /app/devices/verify-second
```

(No corresponding entry needs removing from any index — devices aren't listed anywhere except by directory presence.)

- [ ] **Step 7: Run the full unit test suite one more time against the final state**

Run: `cd whatsap && pnpm test`
Expected: all tests pass (should be 26 existing + 10 new `lib/devices.test.ts` + updates to `lib/tasks.test.ts`/`scheduler.test.ts` already counted above).

This step-by-step verification is the acceptance test for this plan — once all seven pass, the backend core of multi-device support is confirmed working end-to-end, not just in unit tests. The internal API and Nuxt UI are separate, subsequent plans built on top of this one.
