import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readFileTool } from "./read-file.tool.ts";
import { writeFileTool } from "./write-file.tool.ts";
import { listDirectoryTool } from "./list-directory.tool.ts";
import { createDirectoryTool } from "./create-directory.tool.ts";

let cwd: string;
let originalCwd: string;

beforeEach(async () => {
    originalCwd = process.cwd();
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "ai-extension-tools-"));
    process.chdir(cwd);
});

afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(cwd, { recursive: true, force: true });
});

describe("writeFileTool + readFileTool", () => {
    it("writes a file and reads it back", async () => {
        await writeFileTool.invoke({ file_path: "notes/a.txt", content: "hello" });
        const contents = await readFileTool.invoke({ file_path: "notes/a.txt" });
        expect(contents).toBe("hello");
    });

    it("rejects reading a nonexistent file", async () => {
        await expect(readFileTool.invoke({ file_path: "missing.txt" })).rejects.toThrow();
    });
});

describe("createDirectoryTool + listDirectoryTool", () => {
    it("creates a directory and lists its (empty) contents", async () => {
        await createDirectoryTool.invoke({ directoryPath: "sub" });
        const entries = await listDirectoryTool.invoke({ directoryPath: "sub" });
        expect(entries).toEqual([]);
    });

    it("lists files sorted", async () => {
        await writeFileTool.invoke({ file_path: "b.txt", content: "" });
        await writeFileTool.invoke({ file_path: "a.txt", content: "" });
        const entries = await listDirectoryTool.invoke({ directoryPath: "." });
        expect(entries).toEqual(["a.txt", "b.txt"]);
    });

    it("rejects listing a nonexistent directory", async () => {
        await expect(listDirectoryTool.invoke({ directoryPath: "nope" })).rejects.toThrow();
    });
});
