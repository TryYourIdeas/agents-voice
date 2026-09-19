import { describe, it, expect } from "vitest";
import { formatContext, type PageContext } from "./context.ts";

describe("formatContext", () => {
    it("returns undefined when there is no context", () => {
        expect(formatContext(undefined, 100)).toBeUndefined();
    });

    it("formats a selection context under the limit", () => {
        const context: PageContext = { type: "selection", text: "Hello world", url: "https://example.com" };
        const result = formatContext(context, 100);
        expect(result).toContain("Selected text from https://example.com");
        expect(result).toContain("Hello world");
    });

    it("formats a full-page context under the limit", () => {
        const context: PageContext = { type: "page", text: "Page body text", url: "https://example.com/a" };
        const result = formatContext(context, 100);
        expect(result).toContain("Full page text from https://example.com/a");
        expect(result).toContain("Page body text");
    });

    it("truncates text longer than the max and notes it was truncated", () => {
        const context: PageContext = { type: "page", text: "x".repeat(50), url: "https://example.com" };
        const result = formatContext(context, 10)!;
        expect(result).toContain("x".repeat(10));
        expect(result).not.toContain("x".repeat(11));
        expect(result).toContain("[truncated:");
    });

    it("does not add a truncation note when text is exactly at the max", () => {
        const context: PageContext = { type: "page", text: "x".repeat(10), url: "https://example.com" };
        const result = formatContext(context, 10)!;
        expect(result).not.toContain("[truncated:");
    });
});
