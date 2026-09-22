import { tool } from "langchain";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

export const createDirectoryTool = tool(
    async ({ directoryPath }) => {
        const fullPath = path.resolve(process.cwd(), directoryPath);
        await fs.mkdir(fullPath, { recursive: true });
        return `Successfully created directory: ${directoryPath}`;
    },
    {
        name: "create_directory",
        description: "Create a directory, relative to the server's working directory.",
        schema: z.object({
            directoryPath: z.string(),
        }),
    }
);
