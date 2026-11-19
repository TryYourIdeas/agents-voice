import { describe, it, expect, afterEach } from "vitest";
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from "@langchain/core/messages";
import { toolBudgetMiddleware, toolCallsThisRequest } from "./tool-budget-middleware.ts";
import { toolCallBudget } from "../util.ts";
import { loggedTurn } from "../lib/agent-logs.ts";

afterEach(() => { delete process.env.TOOL_CALL_BUDGET; delete process.env.AGENT_RECURSION_LIMIT; delete process.env.SCHEDULED_TOOL_CALL_BUDGET; });

const tools = (n: number) => Array.from({ length: n }, (_, i) => [new AIMessage("x"), new ToolMessage({ tool_call_id: String(i), content: "r" })]).flat();
const run = async (messages: any[]) => {
  let seen: any;
  await (toolBudgetMiddleware as any).wrapModelCall(
    { state: { messages }, systemMessage: new SystemMessage("base") },
    async (r: any) => { seen = r; return "ok"; },
  );
  return seen;
};

describe("toolCallsThisRequest", () => {
  it("counts tool results since the latest human message only", () => {
    expect(toolCallsThisRequest([new HumanMessage("old"), ...tools(7), new HumanMessage("new"), ...tools(2)])).toBe(2);
    expect(toolCallsThisRequest([])).toBe(0);
  });
});

describe("toolCallBudget", () => {
  it("is 40% of the recursion limit, scheduled runs get twice that, env overrides", () => {
    process.env.AGENT_RECURSION_LIMIT = "60";
    expect(toolCallBudget(false)).toBe(24);
    expect(toolCallBudget(true)).toBe(48);
    process.env.TOOL_CALL_BUDGET = "10";
    expect(toolCallBudget(false)).toBe(10);
  });
});

describe("toolBudgetMiddleware", () => {
  it("leaves the request alone under budget", async () => {
    process.env.TOOL_CALL_BUDGET = "5";
    const r = await run([new HumanMessage("q"), ...tools(4)]);
    expect(r.toolChoice).toBeUndefined();
  });
  it("forbids tools and asks for a final answer once the budget is used", async () => {
    process.env.TOOL_CALL_BUDGET = "5";
    const r = await run([new HumanMessage("q"), ...tools(5)]);
    expect(r.toolChoice).toBe("none");
    expect(r.systemMessage.text ?? String(r.systemMessage.content)).toContain("Tool budget used up");
  });
  it("gives scheduled runs their own, larger budget", async () => {
    process.env.TOOL_CALL_BUDGET = "5";
    process.env.SCHEDULED_TOOL_CALL_BUDGET = "20";
    const r = await loggedTurn({ agent: "default", chatId: "scheduled:x", userMessage: "u" }, async () => {
      return (await run([new HumanMessage("q"), ...tools(6)])).toolChoice ?? "auto";
    });
    expect(r).toBe("auto");
  });
});
