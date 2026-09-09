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
