import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";

vi.mock("fs/promises", () => ({
    default: { mkdir: vi.fn() },
}));

import fs from "fs/promises";
import { createCreateDirectoryTool } from "./create-directory.tool.ts";

const config = { configurable: { thread_id: "device:primary:chat-id" } };

describe("createDirectoryTool", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("creates a directory with a simple path, scoped under the device directory", async () => {
        const directoryPath = "test-directory";
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);

        const tool = createCreateDirectoryTool(null as any);
        const result = await tool.invoke({ directoryPath }, config);

        expect(fs.mkdir).toHaveBeenCalledWith(path.join("devices", "primary", directoryPath), { recursive: true });
        expect(result).toBe(`Successfully created directory: ${directoryPath}`);
    });

    it("creates nested directories when the parent doesn't exist", async () => {
        const directoryPath = "parent/child/grandchild";
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);

        const tool = createCreateDirectoryTool(null as any);
        const result = await tool.invoke({ directoryPath }, config);

        expect(fs.mkdir).toHaveBeenCalledWith(path.join("devices", "primary", directoryPath), { recursive: true });
        expect(result).toBe(`Successfully created directory: ${directoryPath}`);
    });

    it("handles an empty directory path by scoping to the device directory itself", async () => {
        const directoryPath = "";
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);

        const tool = createCreateDirectoryTool(null as any);
        const result = await tool.invoke({ directoryPath }, config);

        expect(fs.mkdir).toHaveBeenCalledWith(path.join("devices", "primary"), { recursive: true });
        expect(result).toBe(`Successfully created directory: ${directoryPath}`);
    });

    it("throws when fs.mkdir fails", async () => {
        const directoryPath = "test-dir";
        vi.mocked(fs.mkdir).mockRejectedValue(new Error("EACCES: permission denied"));

        const tool = createCreateDirectoryTool(null as any);

        await expect(tool.invoke({ directoryPath }, config)).rejects.toThrow("EACCES: permission denied");
    });

    it("throws when there's no device context", async () => {
        const tool = createCreateDirectoryTool(null as any);

        await expect(tool.invoke({ directoryPath: "test-dir" }, {})).rejects.toThrow(/no device context/);
    });
});
