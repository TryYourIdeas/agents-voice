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

describe("createAgentDelegationMiddleware", () => {
    it("delegate_to_agent calls the injected runner with device, agent, task and chat id", async () => {
        const { createAgentDelegationMiddleware } = await import("./agent-delegation-middleware.ts");
        const calls: any[] = [];
        const mw = createAgentDelegationMiddleware(async (...a) => { calls.push(a); return "done"; });
        const t = (mw as any).tools[0];
        expect(await t.invoke({ agentName: "mail", task: "check" }, { configurable: { thread_id: "device:dev1:chat7" } })).toBe("done");
        expect(calls).toEqual([["dev1", "mail", "check", "chat7"]]);
    });
    it("a runner error becomes a readable message", async () => {
        const { createAgentDelegationMiddleware } = await import("./agent-delegation-middleware.ts");
        const mw = createAgentDelegationMiddleware(async () => { throw new Error("boom"); });
        const out = await (mw as any).tools[0].invoke({ agentName: "x", task: "t" }, { configurable: { thread_id: "device:d:c" } });
        expect(out).toMatch(/Could not delegate to 'x': boom/);
    });
});
