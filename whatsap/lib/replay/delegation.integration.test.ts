import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import { fakeModel, tool } from "langchain";
import { AIMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { z } from "zod";
import { buildDefaultAgent } from "../../agent.ts";
import { buildNamedAgent } from "../../named-agents.ts";
import { createReplayTools } from "../../tools/replay/index.ts";
import { createReplayDelegate } from "./delegate.ts";
import { Sandbox } from "./sandbox.ts";
import { loggedTurn, openLogsDb, resetLogsDb } from "../agent-logs.ts";
import { extractText } from "../../util.ts";

// The default agent delegates to the real `mail` agent definition (its agent.md prompt and allowed-tools), but
// every tool underneath is a sandbox mock and the model is a script: no network, no real mail.
const DEVICE = "replay-it";
const stub = (name: string) => tool(async () => name, { name, description: "d", schema: z.object({}) });
afterAll(() => fs.rmSync(`devices/${DEVICE}`, { recursive: true, force: true }));
beforeEach(() => resetLogsDb());

describe("replay delegation end to end (scripted model)", () => {
    it("runs the named agent with its own prompt and tools, over the shared sandbox, as a child turn", async () => {
        const db = openLogsDb(":memory:")!;
        const sb = new Sandbox();
        sb.inbox.push({ uid: 4, from: "ann@x.com", to: "me", subject: "Invoice", body: "Please pay" });
        const tools = createReplayTools(sb, { webSearch: stub("web_search"), fetchUrl: stub("fetch_url"), getCurrentDatetime: stub("get_current_datetime") } as any);

        const model: any = fakeModel()
            .respondWithTools([{ id: "c1", name: "delegate_to_agent", args: { agentName: "mail", task: "read my mail" } }]) // default agent
            .respondWithTools([{ id: "c2", name: "yahoo_get_new_emails", args: {} }]) // mail agent
            .respond(new AIMessage("You have 1 email: Invoice")) // mail agent
            .respond(new AIMessage("The mail agent says: you have 1 email")); // default agent
        const o = { model, tools, checkpointer: new MemorySaver(), replay: true };
        const invoke = async ({ agent, message, threadId }: any) => {
            const { HumanMessage } = await import("@langchain/core/messages");
            const r = await agent.invoke({ messages: [new HumanMessage(message)] }, { configurable: { thread_id: threadId } });
            return extractText(r.messages[r.messages.length - 1].content);
        };
        const delegate = createReplayDelegate({ reasoningModel: "scripted", buildAgent: async (n) => buildNamedAgent(DEVICE, n, o as any), invoke });
        const root = buildDefaultAgent(DEVICE, { ...o, delegate } as any);

        const out = await loggedTurn({ device: DEVICE, chatId: "c", agent: "default", userMessage: "what's in my mail?" }, async () => {
            const { HumanMessage } = await import("@langchain/core/messages");
            const r = await root.invoke({ messages: [new HumanMessage("what's in my mail?")] }, { configurable: { thread_id: `device:${DEVICE}:c` } });
            return extractText(r.messages[r.messages.length - 1].content);
        });

        expect(out).toBe("The mail agent says: you have 1 email");
        const turns = db.prepare("SELECT id, parent_turn_id, agent, reasoning_model FROM turns ORDER BY id").all() as any[];
        expect(turns[1]).toMatchObject({ parent_turn_id: turns[0].id, agent: "mail", reasoning_model: "scripted" });
        // the mail agent read the SANDBOX inbox through its allowed tool
        const read = db.prepare("SELECT content FROM events WHERE kind='tool' AND name='yahoo_get_new_emails'").get() as any;
        expect(read?.content ?? "").toContain("Invoice");
    });
});
