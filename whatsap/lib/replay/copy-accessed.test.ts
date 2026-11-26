import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { accessedPaths, copyAccessedFiles } from "./copy-accessed.ts";
import { Sandbox } from "./sandbox.ts";

const tool = (name: string, input: unknown, content: string | null = "x", status = "ok") => ({
    kind: "tool", name, input: JSON.stringify(input), content, status,
});

let root: string;
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "replay-copy-"));
    fs.mkdirSync(path.join(root, "notes"));
    fs.writeFileSync(path.join(root, "notes/a.txt"), "REAL a");
    fs.writeFileSync(path.join(root, "notes/b.txt"), "REAL b");
    fs.writeFileSync(path.join(root, "big.txt"), "x".repeat(50));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("accessedPaths", () => {
    it("collects read files, listed/checked dirs and written files, ignoring errors and unsafe paths", () => {
        const r = accessedPaths([
            tool("my_read_file", { file_path: "notes/a.txt" }),
            tool("my_read_file", { file_path: "devices/dev1/c.txt" }),
            tool("my_read_file", { file_path: "../secret" }),
            tool("list_directory", { directoryPath: "notes" }),
            tool("check_directory_exists", { directoryPath: "empty" }),
            tool("my_write_file", { file_path: "out.txt", content: "y" }),
            tool("my_read_file", { file_path: "gone" }, "boom", "error"),
        ], "dev1");
        expect([...r.read].sort()).toEqual(["c.txt", "notes/a.txt"]);
        expect([...r.dirs].sort()).toEqual(["empty", "notes"]);
        expect([...r.written]).toEqual(["out.txt"]);
    });
});

describe("copyAccessedFiles", () => {
    it("replaces logged content with the real file and copies files of listed directories", async () => {
        const sb = new Sandbox();
        sb.files.set("notes/a.txt", "LOGGED a (truncated)");
        await copyAccessedFiles({ events: [tool("my_read_file", { file_path: "notes/a.txt" }), tool("list_directory", { directoryPath: "notes" })], device: "dev1", deviceRoot: root, sandbox: sb });
        expect(sb.files.get("notes/a.txt")).toBe("REAL a");
        expect(sb.files.get("notes/b.txt")).toBe("REAL b");
        expect(sb.seededPaths.has("notes/b.txt")).toBe(true);
    });
    it("keeps the logged content when the real file is gone, and never overwrites files the run wrote", async () => {
        const sb = new Sandbox();
        sb.files.set("gone.txt", "LOGGED");
        sb.files.set("notes/a.txt", "LOGGED after write");
        await copyAccessedFiles({
            events: [tool("my_read_file", { file_path: "gone.txt" }), tool("my_write_file", { file_path: "notes/a.txt", content: "w" }), tool("my_read_file", { file_path: "notes/a.txt" })],
            device: "dev1", deviceRoot: root, sandbox: sb,
        });
        expect(sb.files.get("gone.txt")).toBe("LOGGED");
        expect(sb.files.get("notes/a.txt")).toBe("LOGGED after write");
    });
    it("skips files over the size cap and records empty dirs", async () => {
        const sb = new Sandbox();
        await copyAccessedFiles({ events: [tool("my_read_file", { file_path: "big.txt" }), tool("check_directory_exists", { directoryPath: "notes" })], device: "dev1", deviceRoot: root, sandbox: sb, maxFileBytes: 10 });
        expect(sb.files.has("big.txt")).toBe(false);
        expect(sb.dirs.has("notes")).toBe(true);
    });
    it("never throws on a missing device directory", async () => {
        const sb = new Sandbox();
        await expect(copyAccessedFiles({ events: [tool("list_directory", { directoryPath: "x" })], device: "d", deviceRoot: path.join(root, "nope"), sandbox: sb })).resolves.toBeUndefined();
    });
});
