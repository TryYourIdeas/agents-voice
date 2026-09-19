import { describe, it, expect, vi, beforeEach } from "vitest";
import { grabSelection, grabPageText } from "./usePageContext.ts";

beforeEach(() => {
    vi.stubGlobal("chrome", {
        tabs: {
            query: vi.fn(async () => [{ id: 42, url: "https://example.com/article" }]),
        },
        scripting: {
            executeScript: vi.fn(async () => [{ result: "extracted text" }]),
        },
    });
});

describe("grabSelection", () => {
    it("returns the active tab's selected text and url", async () => {
        const result = await grabSelection();
        expect(result).toEqual({ type: "selection", text: "extracted text", url: "https://example.com/article" });
    });

    it("throws when there is no active tab", async () => {
        vi.stubGlobal("chrome", {
            tabs: { query: vi.fn(async () => []) },
            scripting: { executeScript: vi.fn() },
        });
        await expect(grabSelection()).rejects.toThrow(/No active tab/);
    });
});

describe("grabPageText", () => {
    it("returns the active tab's page text and url", async () => {
        const result = await grabPageText();
        expect(result).toEqual({ type: "page", text: "extracted text", url: "https://example.com/article" });
    });
});
