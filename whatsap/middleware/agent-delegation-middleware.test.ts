import { describe, it, expect } from "vitest";
import { buildAgentsAddendum } from "./agent-delegation-middleware.ts";

describe("buildAgentsAddendum", () => {
    const text = buildAgentsAddendum([
        { name: "mail", description: "Reads and drafts Yahoo email" },
        { name: "task-scheduler", description: "Schedules tasks" },
    ]);

    it("lists every agent with its description", () => {
        expect(text).toContain("**mail**: Reads and drafts Yahoo email");
        expect(text).toContain("**task-scheduler**: Schedules tasks");
    });

    it("tells the agent to delegate first via delegate_to_agent", () => {
        expect(text).toMatch(/MUST call delegate_to_agent/);
        expect(text).toMatch(/FIRST, before searching files/);
        expect(text).toMatch(/follow-up questions/);
        expect(text).toMatch(/Only handle the request yourself when no agent/);
    });
});
