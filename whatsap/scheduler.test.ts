import { describe, it, expect } from "vitest";
import {
    isDue,
    buildRecurringPrompt,
    isClientReady,
    isStuckResponse,
    recordStuckRun,
    isStuckBackoff,
    stuckAttempts,
    RESUME_NOTE,
    clearStuckRun,
    MAX_STUCK_ATTEMPTS,
    STUCK_RETRY_DELAY_MS,
} from "./scheduler.ts";
import { RECURSION_LIMIT_REPLY } from "./util.ts";
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

    it("states today's date in the task's timezone and warns that notes are not today's facts", () => {
        const now = new Date("2026-10-31T09:04:00Z");
        const prompt = buildRecurringPrompt(recurringTask, "On 2026-09-24 covered Gemini 4.", now);
        expect(prompt).toContain("Today is Saturday, 2026-10-31");
        expect(prompt).toContain("do not re-search");
        expect(prompt.indexOf("Today is")).toBeLessThan(prompt.indexOf("## Notes from previous runs"));
    });

    it("asks for stories from the last 24 hours and tells the agent to stop after saving", () => {
        const prompt = buildRecurringPrompt(recurringTask, "notes", new Date("2026-10-31T09:04:00Z"));
        expect(prompt).toContain("last 24 hours");
        expect(prompt).toContain("do not re-list or re-read files");
        expect(prompt).toContain("403/404");
        expect(prompt).not.toContain(RESUME_NOTE);
    });

    it("adds a resume note when an earlier attempt got stuck", () => {
        expect(buildRecurringPrompt(recurringTask, "notes", new Date(), true)).toContain(RESUME_NOTE);
        expect(buildRecurringPrompt(recurringTask, undefined, new Date(), true)).toContain(RESUME_NOTE);
    });

    it("states today's date on the first run too", () => {
        expect(buildRecurringPrompt(recurringTask, undefined, new Date("2026-10-31T09:04:00Z"))).toContain("2026-10-31");
    });
});

describe("stuck (recursion-limit) runs", () => {
    it("recognises the recursion-limit fallback reply", () => {
        expect(isStuckResponse(RECURSION_LIMIT_REPLY)).toBe(true);
        expect(isStuckResponse("All done")).toBe(false);
    });

    it("backs off between retries then gives up after MAX_STUCK_ATTEMPTS", () => {
        const t0 = 1_000_000;
        clearStuckRun("d", "job");
        for (let i = 1; i < MAX_STUCK_ATTEMPTS; i++) {
            expect(recordStuckRun("d", "job", t0)).toBe(false);
            expect(isStuckBackoff("d", "job", t0 + 1)).toBe(true);
            expect(isStuckBackoff("d", "job", t0 + STUCK_RETRY_DELAY_MS)).toBe(false);
        }
        expect(stuckAttempts("d", "job")).toBe(MAX_STUCK_ATTEMPTS - 1);
        expect(recordStuckRun("d", "job", t0)).toBe(true);
        expect(isStuckBackoff("d", "job", t0 + 1)).toBe(false);
    });
});

describe("isClientReady", () => {
    it("is false when the browser page never came up (pupPage null)", () => {
        expect(isClientReady({ pupPage: null })).toBe(false);
    });

    it("is false for a missing client", () => {
        expect(isClientReady(undefined)).toBe(false);
    });

    it("is true once the browser page exists", () => {
        expect(isClientReady({ pupPage: {} })).toBe(true);
    });
});
