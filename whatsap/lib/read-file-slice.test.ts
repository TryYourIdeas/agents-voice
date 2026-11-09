import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSlice } from "./read-file-slice.ts";

let dir: string;
beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "readslice-"));
});
const write = (name: string, content: string) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
};

describe("readFileSlice", () => {
    it("returns a small file unchanged, with no notice", async () => {
        expect(await readFileSlice(write("a.txt", "hello"), 0, 100)).toBe("hello");
    });
    it("returns an empty file as empty", async () => {
        expect(await readFileSlice(write("e.txt", ""), 0, 100)).toBe("");
    });
    it("truncates a large file and says how to continue", async () => {
        const out = await readFileSlice(write("b.txt", "x".repeat(1000)), 0, 100);
        expect(out.startsWith("x".repeat(100))).toBe(true);
        expect(out).toContain("[truncated: showed bytes 0-100 of 1000");
        expect(out).toContain("offset=100");
        expect(out.length).toBeLessThan(500);
    });
    it("pages from an offset to the end without a notice", async () => {
        const p = write("c.txt", "0123456789");
        expect(await readFileSlice(p, 6, 100)).toBe("6789");
    });
    it("reports an offset past the end", async () => {
        expect(await readFileSlice(write("d.txt", "abc"), 50, 100)).toContain("past the end");
    });
    it("does not load the whole file for a huge one", async () => {
        const p = path.join(dir, "huge.txt");
        const fd = fs.openSync(p, "w");
        fs.ftruncateSync(fd, 200 * 1024 * 1024); // sparse 200 MB
        fs.closeSync(fd);
        const out = await readFileSlice(p, 0, 1000);
        expect(out).toContain("of 209715200");
    });
});
