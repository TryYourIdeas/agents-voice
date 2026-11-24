import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAgent, tool, fakeModel } from "langchain";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { openLogsDb, resetLogsDb, loggedTurn, logEvent, contentToText, cap, capJson, currentTurnId, reasoningModelName } from "./agent-logs.ts";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentLogsMiddleware } from "../middleware/agent-logs-middleware.ts";

function db() {
    return openLogsDb(":memory:")!;
}
const rows = (sql: string, ...p: any[]) => db().prepare(sql).all(...p) as any[];

beforeEach(() => {
    resetLogsDb();
    db();
});

describe("capJson", () => {
    it("keeps small values as is", () => {
        expect(capJson({ a: 1 }, 100)).toEqual({ text: '{"a":1}', truncated: false });
    });
    it("always returns valid JSON when too big, shortening long strings and keeping usage", () => {
        const big = { tool_calls: [{ name: "my_write_file", args: { content: "x".repeat(50_000) } }], usage: { input_tokens: 7, output_tokens: 3 } };
        const r = capJson(big, 10_000);
        expect(r.truncated).toBe(true);
        const parsed = JSON.parse(r.text);
        expect(parsed.usage).toEqual({ input_tokens: 7, output_tokens: 3 });
        expect(parsed.tool_calls[0].args.content.length).toBeLessThan(2100);
        const huge = { usage: { input_tokens: 1 }, tool_calls: Array.from({ length: 500 }, (_, i) => ({ id: "id" + i, name: "n".repeat(100) })) };
        const r2 = capJson(huge, 500);
        expect(JSON.parse(r2.text)).toEqual({ truncated: true, usage: { input_tokens: 1 } });
    });
});

describe("contentToText / cap", () => {
    it("flattens blocks and never stores image data", () => {
        expect(contentToText([{ type: "text", text: "hi" }, { type: "image", mimeType: "image/png", data: "AAAA" }, { type: "thinking", thinking: "x" }])).toBe("hi\n[image image/png]");
        expect(contentToText("plain")).toBe("plain");
    });
    it("truncates and flags", () => {
        expect(cap("abcdef", 3)).toEqual({ text: "abc", truncated: true });
        expect(cap("ab", 3)).toEqual({ text: "ab", truncated: false });
    });
});

describe("loggedTurn", () => {
    it("records user message, final response and duration", async () => {
        const out = await loggedTurn({ device: "primary", chatId: "c1", agent: "default", userMessage: "hello" }, async () => "world");
        expect(out).toBe("world");
        const [t] = rows("SELECT * FROM turns");
        expect(t).toMatchObject({ device: "primary", chat_id: "c1", agent: "default", source: "chat", user_message: "hello", final_response: "world", status: "ok" });
        expect(t.duration_ms).toBeGreaterThanOrEqual(0);
    });
    it("records errors and rethrows", async () => {
        await expect(loggedTurn({ agent: "a", userMessage: "x" }, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
        expect(rows("SELECT status, error FROM turns")[0]).toMatchObject({ status: "error" });
        expect(rows("SELECT error FROM turns")[0].error).toContain("boom");
    });
    it("marks recursion-limit replies", async () => {
        await loggedTurn({ agent: "a", userMessage: "x" }, async () => "LIMIT", "LIMIT");
        expect(rows("SELECT status FROM turns")[0].status).toBe("recursion_limit");
    });
    it("links nested runs as delegated sub-agent turns and tags scheduled runs", async () => {
        await loggedTurn({ agent: "default", userMessage: "q" }, async () => {
            await loggedTurn({ agent: "mail", userMessage: "task" }, async () => "sub");
            return "done";
        });
        await loggedTurn({ agent: "default", chatId: "scheduled:t:1", userMessage: "s" }, async () => "ok");
        const t = rows("SELECT id, parent_turn_id, agent, source FROM turns ORDER BY id");
        expect(t[1]).toMatchObject({ agent: "mail", source: "delegated", parent_turn_id: t[0].id });
        expect(t[2].source).toBe("scheduled");
    });
    it("does not break the agent when logging is unavailable", async () => {
        resetLogsDb();
        vi.stubEnv("AGENT_LOGS_ENABLED", "false");
        expect(await loggedTurn({ agent: "a", userMessage: "x" }, async () => "fine")).toBe("fine");
        vi.unstubAllEnvs();
    });
});

describe("events", () => {
    it("attaches to the active turn", async () => {
        await loggedTurn({ agent: "a", userMessage: "x" }, async () => {
            expect(currentTurnId()).toBeDefined();
            logEvent({ kind: "tool", name: "t", input: { a: 1 }, content: "r" });
            return "y";
        });
        logEvent({ kind: "tool", name: "orphan" });
        const e = rows("SELECT * FROM events ORDER BY id");
        expect(e[0]).toMatchObject({ name: "t", input: '{"a":1}', content: "r", status: "ok" });
        expect(e[0].turn_id).not.toBeNull();
        expect(e[1].turn_id).toBeNull();
    });
});

describe("agentLogsMiddleware with a real agent loop", () => {
    it("captures model responses and tool results inside the turn", async () => {
        const echo = tool(async ({ text }: { text: string }) => `echo:${text}`, { name: "echo", description: "echo", schema: z.object({ text: z.string() }) });
        const model = fakeModel()
            .respondWithTools([{ id: "call1", name: "echo", args: { text: "hi" } }])
            .respond(new AIMessage("all done"));
        const agent = createAgent({ model: model as any, tools: [echo], middleware: [agentLogsMiddleware] });
        const out = await loggedTurn({ agent: "default", userMessage: "go" }, async () => {
            const r = await agent.invoke({ messages: [new HumanMessage("go")] });
            return String(r.messages[r.messages.length - 1].content);
        });
        expect(out).toBe("all done");
        const turn = rows("SELECT id FROM turns")[0];
        const ev = rows("SELECT * FROM events WHERE turn_id = ? ORDER BY id", turn.id);
        expect(ev.map((e) => e.kind)).toEqual(["model", "tool", "model"]);
        expect(JSON.parse(ev[0].data).tool_calls[0]).toMatchObject({ name: "echo", args: { text: "hi" } });
        expect(ev[1]).toMatchObject({ name: "echo", tool_call_id: "call1", content: "echo:hi", status: "ok" });
        expect(ev[2].content).toBe("all done");
    });
});

describe("replay columns", () => {
    it("migrates an existing DB without replay columns", () => {
        resetLogsDb();
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logs-"));
        const file = path.join(dir, "old.db");
        const old = new DatabaseSync(file);
        old.exec("CREATE TABLE turns (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_turn_id INTEGER, started_at TEXT NOT NULL, agent TEXT NOT NULL, source TEXT NOT NULL, model TEXT, user_message TEXT, status TEXT NOT NULL DEFAULT 'running')");
        old.close();
        const d = openLogsDb(file)!;
        const cols = (d.prepare("PRAGMA table_info(turns)").all() as any[]).map((c) => c.name);
        expect(cols).toContain("replay_of");
        expect(cols).toContain("reasoning_model");
        const tables = (d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]).map((t) => t.name);
        expect(tables).toEqual(expect.arrayContaining(["replay_messages", "replay_files", "replay_emails"]));
        resetLogsDb();
    });
    it("stores reasoning_model and replay_of", async () => {
        await loggedTurn({ agent: "default", userMessage: "orig" }, async () => "ok");
        const original = rows("SELECT id FROM turns")[0].id;
        await loggedTurn({ agent: "default", userMessage: "hi", reasoningModel: "m1", replayOf: original }, async () => "ok");
        const r = rows("SELECT reasoning_model, replay_of FROM turns WHERE replay_of IS NOT NULL")[0];
        expect(r).toEqual({ reasoning_model: "m1", replay_of: original });
    });
    it("defaults reasoning_model from the environment", async () => {
        await loggedTurn({ agent: "default", userMessage: "hi" }, async () => "ok");
        expect(rows("SELECT reasoning_model FROM turns")[0].reasoning_model).toBe(reasoningModelName());
    });
    it("reasoningModelName prefers REASONING_MODEL_NAME", () => {
        expect(reasoningModelName({ REASONING_MODEL_NAME: "lfm", ANTHROPIC_MODEL: "x" } as any)).toBe("lfm");
        expect(reasoningModelName({ ANTHROPIC_MODEL: "x" } as any)).toBe("x");
    });
});
