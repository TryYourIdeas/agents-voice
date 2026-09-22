import { tool } from "langchain";
import { z } from "zod";
import { existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";

export const listDirectoryTool = tool(
    async ({ directoryPath }) => {
        const fullPath = path.resolve(process.cwd(), directoryPath);
        if (!existsSync(fullPath)) {
            throw new Error(`Directory does not exist: ${directoryPath}`);
        }
        if (!statSync(fullPath).isDirectory()) {
            throw new Error(`Path is not a directory: ${directoryPath}`);
        }
        return readdirSync(fullPath).sort();
    },
    {
        name: "list_directory",
        description: "List all files and subdirectories in a given directory, relative to the server's working directory.",
        schema: z.object({
            directoryPath: z.string().describe("Path to the directory to list files from"),
        }),
    }
);
