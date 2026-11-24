import { describe, it, expect, beforeEach, vi } from "vitest";
import { createReplayDelegate } from "./delegate.ts";
import { loggedTurn, openLogsDb, resetLogsDb } from "../agent-logs.ts";

let db: NonNullable<ReturnType<typeof openLogsDb>>;
beforeEach(() => {
    resetLogsDb();
    db = openLogsDb(":memory:")!;
});

describe("createReplayDelegate", () => {
    it("runs the named agent with the replay model, logged as a child turn of the replay", async () => {
        const buildAgent = vi.fn(async (name: string) => ({ name }));
        const invoke = vi.fn(async () => "sub answer");
        const delegate = createReplayDelegate({ reasoningModel: "qwen3.5-4b", buildAgent, invoke });
        const out = await loggedTurn({ agent: "default", userMessage: "root" }, () => delegate("dev1", "mail", "check my mail", "chat9"));
        expect(out).toBe("sub answer");
        const rows = db.prepare("SELECT parent_turn_id, agent, source, reasoning_model, user_message, final_response FROM turns ORDER BY id").all() as any[];
        expect(rows[1]).toEqual({ parent_turn_id: 1, agent: "mail", source: "delegated", reasoning_model: "qwen3.5-4b", user_message: "check my mail", final_response: "sub answer" });
        expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ message: "check my mail", threadId: "device:dev1:agent:mail:chat9" }));
    });
    it("builds each named agent once per replay, so follow-ups keep their history", async () => {
        const buildAgent = vi.fn(async (name: string) => ({ name }));
        const delegate = createReplayDelegate({ reasoningModel: "m", buildAgent, invoke: async () => "ok" });
        await loggedTurn({ agent: "default", userMessage: "root" }, async () => {
            await delegate("d", "mail", "a", "c");
            await delegate("d", "mail", "b", "c");
            await delegate("d", "math-coach", "c", "c");
            return "x";
        });
        expect(buildAgent.mock.calls.map((c) => c[0])).toEqual(["mail", "math-coach"]);
    });
    it("an unknown agent or a failing run becomes a readable message, not a thrown error", async () => {
        const delegate = createReplayDelegate({
            reasoningModel: "m",
            buildAgent: async (n: string) => { if (n === "nope") throw new Error("Agent 'nope' not found."); return {}; },
            invoke: async () => { throw new Error("connect ECONNREFUSED"); },
        });
        await loggedTurn({ agent: "default", userMessage: "root" }, async () => {
            expect(await delegate("d", "nope", "t", "c")).toMatch(/Could not delegate to 'nope'.*not found/);
            expect(await delegate("d", "mail", "t", "c")).toMatch(/Could not delegate to 'mail'.*ECONNREFUSED/);
            return "x";
        });
    });
});
