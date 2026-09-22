import { describe, it, expect } from "vitest";
import { executeBashTool } from "./execute-bash.tool.ts";

describe("executeBashTool", () => {
    it("runs a command and returns stdout", async () => {
        const output = await executeBashTool.invoke({ command: "echo hello-from-bash" });
        expect(output).toContain("hello-from-bash");
    });

    it("returns stderr output for a failing command", async () => {
        await expect(executeBashTool.invoke({ command: "exit 1" })).rejects.toBeTruthy();
    });
});
