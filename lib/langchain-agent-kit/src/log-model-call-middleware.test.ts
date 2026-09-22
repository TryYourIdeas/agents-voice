import { describe, it, expect, vi, afterEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { createLogModelCallMiddleware } from "./log-model-call-middleware.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("createLogModelCallMiddleware", () => {
    it("prefixes both log lines with the given prefix", () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const middleware = createLogModelCallMiddleware({ prefix: "[test]" });
        const state = { messages: [new HumanMessage("hello")] };

        middleware.beforeModel?.(state as never, {} as never);
        middleware.afterModel?.(state as never, {} as never);

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[test] calling model with 1 messages"));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[test] model returned:"));
    });

    it("truncates the returned-content log line when truncate is given", () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const middleware = createLogModelCallMiddleware({ prefix: "[test]", truncate: 10 });
        const state = { messages: [new HumanMessage("a".repeat(100))] };

        middleware.afterModel?.(state as never, {} as never);

        const loggedLine = logSpy.mock.calls[0][0] as string;
        expect(loggedLine).toBe(`[test] model returned: ${JSON.stringify("a".repeat(100)).slice(0, 10)}`);
    });

    it("does not truncate when truncate is omitted", () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const middleware = createLogModelCallMiddleware({ prefix: "[test]" });
        const longContent = "a".repeat(1000);
        const state = { messages: [new HumanMessage(longContent)] };

        middleware.afterModel?.(state as never, {} as never);

        const loggedLine = logSpy.mock.calls[0][0] as string;
        expect(loggedLine.length).toBeGreaterThan(1000);
    });
});
