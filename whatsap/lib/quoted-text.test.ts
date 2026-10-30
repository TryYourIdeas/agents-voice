import { describe, it, expect } from "vitest";
import { quotedMessageText, withQuotedText } from "./quoted-text.ts";

describe("quotedMessageText", () => {
    it("returns the body of a quoted text message", () => {
        expect(quotedMessageText({ quotedMsg: { type: "chat", body: " Hello world \n" } })).toBe("Hello world");
    });

    it("uses the caption, not the thumbnail body, of quoted media", () => {
        expect(quotedMessageText({ quotedMsg: { type: "video", body: "/9j/4AAQSkZJRg==", caption: "Lula fará pronunciamento" } })).toBe("Lula fará pronunciamento");
        expect(quotedMessageText({ quotedMsg: { type: "image", body: "/9j/4AAQSkZJRg==" } })).toBeUndefined();
    });

    it("ignores audio, which is transcribed separately", () => {
        expect(quotedMessageText({ quotedMsg: { type: "ptt", body: "" } })).toBeUndefined();
    });

    it("returns undefined when nothing is quoted or the quote is empty", () => {
        expect(quotedMessageText({})).toBeUndefined();
        expect(quotedMessageText(undefined)).toBeUndefined();
        expect(quotedMessageText({ quotedMsg: { type: "chat", body: "  " } })).toBeUndefined();
    });
});

describe("withQuotedText", () => {
    it("appends the replied-to text after the request, clearly labelled", () => {
        const out = withQuotedText("make an audio of this", "The story text");
        expect(out).toContain("make an audio of this");
        expect(out).toMatch(/replying to/i);
        expect(out.endsWith("The story text")).toBe(true);
    });

    it("leaves the request unchanged when there is no quoted text", () => {
        expect(withQuotedText("hi", undefined)).toBe("hi");
    });
});
