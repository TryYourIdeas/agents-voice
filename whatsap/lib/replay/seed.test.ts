import { describe, it, expect } from "vitest";
import { seedFromEvents } from "./seed.ts";

const tool = (name: string, input: unknown, content: string | null, status: string | null = "ok") => ({
    kind: "tool", name, input: input === null ? null : JSON.stringify(input), content, status,
});

describe("seedFromEvents", () => {
    it("seeds a file from a my_read_file event", () => {
        const r = seedFromEvents([tool("my_read_file", { file_path: "notes/a.txt" }, "hello")]);
        expect(r.files.get("notes/a.txt")).toBe("hello");
    });
    it("seeds inbox from a yahoo_get_new_emails JSON result", () => {
        const emails = [{ uid: 5, from: "a@b", to: "me", subject: "Hi", date: "d", body: "Body", truncated: false }];
        const r = seedFromEvents([tool("yahoo_get_new_emails", {}, JSON.stringify(emails, null, 2))]);
        expect(r.inbox).toEqual([{ uid: 5, from: "a@b", to: "me", subject: "Hi", date: "d", body: "Body" }]);
    });
    it("ignores my_write_file events", () => {
        expect(seedFromEvents([tool("my_write_file", { file_path: "x", content: "y" }, "Successfully wrote")]).files.size).toBe(0);
    });
    it("ignores errored events, unparsable JSON and unsafe paths", () => {
        const r = seedFromEvents([
            tool("my_read_file", { file_path: "a" }, "boom", "error"),
            tool("yahoo_get_new_emails", {}, "{not json"),
            tool("my_read_file", { file_path: "../secret" }, "x"),
            tool("my_read_file", null, "x"),
            tool("my_read_file", { file_path: "b" }, null),
        ]);
        expect(r.files.size).toBe(0);
        expect(r.inbox).toEqual([]);
    });
    it("de-duplicates emails by uid", () => {
        const e = JSON.stringify([{ uid: 1, from: "a", to: "b", subject: "s", body: "x" }]);
        expect(seedFromEvents([tool("yahoo_get_new_emails", {}, e), tool("yahoo_get_new_emails", {}, e)]).inbox).toHaveLength(1);
    });
    it("empty events give an empty sandbox", () => {
        expect(seedFromEvents([])).toEqual({ files: new Map(), inbox: [] });
    });
});
