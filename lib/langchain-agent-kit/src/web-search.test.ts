import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWebSearchTool } from "./web-search.ts";

const mockCall = vi.fn();

vi.mock("@langchain/tavily", () => ({
    // A regular function, not an arrow function — arrow functions can't be
    // invoked with `new`, which is how the tool constructs TavilySearch.
    TavilySearch: vi.fn().mockImplementation(function () {
        return { _call: mockCall };
    }),
}));

beforeEach(() => {
    mockCall.mockReset();
});

describe("createWebSearchTool", () => {
    it("applies default args when omitted and returns the raw result", async () => {
        mockCall.mockResolvedValue({ results: ["a"] });
        const searchTool = createWebSearchTool();

        const result = await searchTool.invoke({ query: "hello" });

        expect(result).toEqual({ results: ["a"] });
        expect(mockCall).toHaveBeenCalledWith({ query: "hello" });
    });

    it("calls onResult with args, result, and config when provided", async () => {
        mockCall.mockResolvedValue({ results: ["b"] });
        const onResult = vi.fn();
        const searchTool = createWebSearchTool({ onResult });

        await searchTool.invoke(
            { query: "topic test", maxResults: 3, topic: "news", includeRawContent: true },
            { configurable: { thread_id: "device:test:1" } }
        );

        expect(onResult).toHaveBeenCalledTimes(1);
        const [args, result] = onResult.mock.calls[0];
        expect(args).toEqual({ query: "topic test", maxResults: 3, topic: "news", includeRawContent: true });
        expect(result).toEqual({ results: ["b"] });
    });

    it("does not throw and still returns the result when onResult is omitted", async () => {
        mockCall.mockResolvedValue({ results: [] });
        const searchTool = createWebSearchTool();

        await expect(searchTool.invoke({ query: "no callback" })).resolves.toEqual({ results: [] });
    });
});
