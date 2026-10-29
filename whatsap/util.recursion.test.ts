import { describe, it, expect, afterEach } from "vitest";
import { agentRecursionLimit, isRecursionLimitError } from "./util.ts";

afterEach(() => { delete process.env.AGENT_RECURSION_LIMIT; });

describe("recursion limit helpers", () => {
    it("defaults to 100 and honours AGENT_RECURSION_LIMIT", () => {
        expect(agentRecursionLimit()).toBe(100);
        process.env.AGENT_RECURSION_LIMIT = "25";
        expect(agentRecursionLimit()).toBe(25);
        process.env.AGENT_RECURSION_LIMIT = "junk";
        expect(agentRecursionLimit()).toBe(100);
    });
    it("recognises LangGraph's recursion error", () => {
        expect(isRecursionLimitError({ lc_error_code: "GRAPH_RECURSION_LIMIT" })).toBe(true);
        expect(isRecursionLimitError(new Error("x"))).toBe(false);
    });
});
