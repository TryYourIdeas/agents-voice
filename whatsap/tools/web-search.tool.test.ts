import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.hoisted(() => vi.fn(async (..._a: any[]) => "RESULT"));
vi.mock("langchain-agent-kit", async () => {
    const { tool } = await import("langchain");
    const { z } = await import("zod");
    return {
        createWebSearchTool: () => {
            const t: any = tool(async () => "RESULT", {
                name: "web_search",
                description: "Run a web search",
                schema: z.object({ query: z.string(), topic: z.enum(["general", "news"]).optional().default("general") }),
            });
            t.invoke = invoke;
            return t;
        },
    };
});

import { webSearch } from "./web-search.tool.ts";
import { resetSearchDedupe } from "../lib/search-dedupe.ts";

const cfg = { configurable: { thread_id: "device:primary:t1" } };

describe("web_search duplicate guard", () => {
    beforeEach(() => {
        invoke.mockClear();
        resetSearchDedupe();
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("keeps the web_search name", () => {
        expect(webSearch.name).toBe("web_search");
    });

    it("searches once and answers an identical repeat with a nudge", async () => {
        expect(await webSearch.invoke({ query: "AI news" }, cfg)).toBe("RESULT");
        const second = await webSearch.invoke({ query: "AI news" }, cfg);
        expect(second).toMatch(/already ran/);
        expect(invoke).toHaveBeenCalledTimes(1);
    });
});
