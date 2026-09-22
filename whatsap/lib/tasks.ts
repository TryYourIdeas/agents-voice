// lib/tasks.ts
//
// File-backed storage for scheduled tasks, now scoped per device (see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md). Each
// active task is one file under devices/<device>/tasks/ — frontmatter +
// body, parsed with the same langchain-agent-kit frontmatter parsing used by
// agent.md/SKILL.md. index.md files are regenerated display listings, not
// a second source of truth — the *.md task files themselves are
// authoritative for anything that reads task state.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter, parseMetadataField } from "langchain-agent-kit";

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
