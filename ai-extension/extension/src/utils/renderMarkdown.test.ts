import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./renderMarkdown.ts";

describe("renderMarkdown", () => {
    it("renders bold and italic text", () => {
        const html = renderMarkdown("**bold** and *italic*");
        expect(html).toContain("<strong>bold</strong>");
        expect(html).toContain("<em>italic</em>");
    });

    it("renders lists", () => {
        const html = renderMarkdown("- one\n- two");
        expect(html).toContain("<ul>");
        expect(html).toContain("<li>one</li>");
    });

    it("renders fenced code blocks", () => {
        const html = renderMarkdown("```\nconst x = 1;\n```");
        expect(html).toContain("<pre>");
        expect(html).toContain("const x = 1;");
    });

    it("turns single newlines into <br> (breaks: true)", () => {
        const html = renderMarkdown("line one\nline two");
        expect(html).toContain("<br>");
    });

    it("adds target=_blank and rel=noopener to links", () => {
        const html = renderMarkdown("[link](https://example.com)");
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
    });

    it("escapes raw HTML from the source text instead of executing it", () => {
        const html = renderMarkdown("<img src=x onerror=alert(1)>hello");
        expect(html).not.toContain("<img");
        expect(html).toContain("&lt;img");
    });

    it("strips script tags injected via markdown", () => {
        const html = renderMarkdown("<script>alert(1)</script>plain text");
        expect(html).not.toContain("<script");
        expect(html).toContain("plain text");
    });

    it("autolinks bare URLs (linkify: true)", () => {
        const html = renderMarkdown("see https://example.com for more");
        expect(html).toContain('href="https://example.com"');
    });
});
