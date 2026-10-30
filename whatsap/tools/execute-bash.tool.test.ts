import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createExecuteBashTool } from "./execute-bash.tool.ts";

const device = "zz-bash-test";
const deviceDir = path.resolve("devices", device);

afterAll(() => fs.rmSync(deviceDir, { recursive: true, force: true }));

describe("execute_bash", () => {
    it("runs from the device directory so relative paths match the file tools", async () => {
        const tool = createExecuteBashTool();
        const out = await tool.invoke({ command: "pwd && mkdir -p notes && echo hi > notes/a.md" }, { configurable: { thread_id: `device:${device}:chat` } });
        expect(String(out).trim().split("\n")[0]).toBe(deviceDir);
        expect(fs.readFileSync(path.join(deviceDir, "notes", "a.md"), "utf-8")).toBe("hi\n");
    });
});
