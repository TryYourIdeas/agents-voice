import { tool } from "langchain";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

export const readFileTool = tool(
    async ({ file_path }) => {
        const fullPath = path.resolve(process.cwd(), file_path);
        return fs.readFile(fullPath, "utf-8");
    },
    {
        name: "my_read_file",
        description: "Read a file, relative to the server's working directory, and return its content.",
        schema: z.object({
            file_path: z.string(),
        }),
    }
);
