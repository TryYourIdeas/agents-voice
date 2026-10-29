import { describe, it, expect } from "vitest";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { describeMessage } from "./message-trace.ts";

describe("describeMessage", () => {
    it("shows message kind, block types and tool-call linkage", () => {
        const ai = new AIMessage({ content: [{ type: "thinking", thinking: "x" }, { type: "tool_use", id: "t1", name: "web_search", input: {} }], tool_calls: [{ id: "t1", name: "web_search", args: { query: "q" } }] });
        const tool = new ToolMessage({ content: "results", tool_call_id: "t1" });
        expect(describeMessage(new HumanMessage("hi"), 0)).toBe("#0 human content=text(2)");
        expect(describeMessage(ai, 1)).toContain("content=thinking+tool_use:web_search");
        expect(describeMessage(ai, 1)).toContain('tool_calls=[web_search:t1:args={"query":"q"}]');
        expect(describeMessage(tool, 2)).toContain("tool_call_id=t1");
    });
});
