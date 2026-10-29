import { describe, it, expect } from "vitest";
import { htmlToText } from "./html-to-text.ts";

describe("htmlToText", () => {
    it("drops scripts, styles, comments and head noise but keeps the title", () => {
        const html = `<html><head><title>Top &amp; Stories</title><style>.a{color:red}</style>
            <script>var x = "<b>not text</b>";</script></head><body><!-- hidden --><p>Hello</p></body></html>`;
        const text = htmlToText(html);
        expect(text).toContain("Title: Top & Stories");
        expect(text).toContain("Hello");
        expect(text).not.toMatch(/color:red|not text|hidden|var x/);
    });

    it("marks headings and list items and keeps block structure on separate lines", () => {
        const text = htmlToText("<h1>Main</h1><h2>Sub</h2><ul><li>one</li><li>two</li></ul><p>a</p><p>b</p>");
        expect(text.split("\n")).toEqual(["# Main", "## Sub", "- one", "- two", "a", "b"]);
    });

    it("keeps link targets next to the link text so the agent can follow them", () => {
        expect(htmlToText('<a href="/world/story">Big story</a>')).toBe("Big story (/world/story)");
    });

    it("decodes common and numeric entities and collapses whitespace", () => {
        expect(htmlToText("<p>  a&nbsp;&nbsp;b &#8217;c&#x27; &lt;d&gt;  </p>")).toBe("a b ’c' <d>");
    });

    it("returns plain text input unchanged", () => {
        expect(htmlToText("just text")).toBe("just text");
    });
});
