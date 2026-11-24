import { describe, it, expect, beforeEach } from "vitest";
import { Sandbox } from "./sandbox.ts";
import { openLogsDb, resetLogsDb } from "../agent-logs.ts";

beforeEach(() => resetLogsDb());

describe("Sandbox.normalizePath", () => {
    const s = new Sandbox();
    it("rejects parent traversal and absolute paths", () => {
        expect(() => s.normalizePath("../x")).toThrow();
        expect(() => s.normalizePath("a/../../x")).toThrow();
        expect(() => s.normalizePath("/etc/passwd")).toThrow();
    });
    it("normalizes ./ and duplicate slashes", () => {
        expect(s.normalizePath("./a//b.txt")).toBe("a/b.txt");
    });
});

describe("Sandbox.persist", () => {
    it("writes files, emails and messages for the turn id", () => {
        const db = openLogsDb(":memory:")!;
        db.prepare("INSERT INTO turns (started_at, agent, source) VALUES ('t','default','chat')").run();
        const s = new Sandbox();
        s.files.set("a.txt", "hello");
        s.seededPaths.add("a.txt");
        s.files.set("b.txt", "new");
        s.inbox.push({ uid: 1, from: "x@y", to: "me", subject: "S", body: "B" });
        s.sent.push({ uid: 1, from: "me", to: "x@y", subject: "Re: S", body: "R", inReplyToUid: 1 });
        s.addMessage("reply", "hi");
        s.persist(1);
        expect(db.prepare("SELECT path, content, origin FROM replay_files ORDER BY path").all()).toEqual([
            { path: "a.txt", content: "hello", origin: "seeded" },
            { path: "b.txt", content: "new", origin: "written" },
        ]);
        expect(db.prepare("SELECT folder, uid, subject, in_reply_to_uid FROM replay_emails ORDER BY folder").all()).toEqual([
            { folder: "inbox", uid: 1, subject: "S", in_reply_to_uid: null },
            { folder: "sent", uid: 1, subject: "Re: S", in_reply_to_uid: 1 },
        ]);
        expect(db.prepare("SELECT seq, kind, text FROM replay_messages").all()).toEqual([{ seq: 1, kind: "reply", text: "hi" }]);
    });
});
