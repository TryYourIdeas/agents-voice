import { describe, it, expect } from "vitest";
import { isDue, buildRecurringPrompt } from "./scheduler.ts";
import type { ScheduledTask } from "./lib/tasks.ts";

// Only the fields isDue actually reads are set on each fixture — the rest
// of ScheduledTask isn't relevant to this pure function.
function task(overrides: Partial<ScheduledTask>): ScheduledTask {
    return {
        name: "t",
        description: "d",
        scheduleType: "recurring",
        schedule: "* * * * *",
        timezone: "UTC",
        targetAgent: "default",
        destinationChat: "@x",
        createdByChat: "@x",
        status: "active",
        body: "b",
        ...overrides,
    };
}

describe("isDue", () => {
    it("a one-off task in the past is due", () => {
        const past = new Date(Date.now() - 60_000).toISOString();
        expect(isDue(task({ scheduleType: "once", schedule: past }))).toBe(true);
    });

    it("a one-off task in the future is not due", () => {
        const future = new Date(Date.now() + 3_600_000).toISOString();
        expect(isDue(task({ scheduleType: "once", schedule: future }))).toBe(false);
    });

    it("a recurring task that has never run is due", () => {
        expect(isDue(task({ scheduleType: "recurring", schedule: "* * * * *" }))).toBe(true);
    });

    it("a recurring task that just ran is not due again immediately", () => {
        expect(
            isDue(task({ scheduleType: "recurring", schedule: "* * * * *", lastRun: new Date().toISOString() }))
        ).toBe(false);
    });

    it("a recurring task whose last run predates the most recent occurrence is due", () => {
        const longAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
        expect(isDue(task({ scheduleType: "recurring", schedule: "* * * * *", lastRun: longAgo }))).toBe(true);
    });
});

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
