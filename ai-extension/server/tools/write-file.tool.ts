import { tool } from "langchain";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

export const writeFileTool = tool(
    async ({ file_path, content }) => {
        const fullPath = path.resolve(process.cwd(), file_path);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
        return `Successfully wrote to file: ${file_path}`;
    },
    {
        name: "my_write_file",
        description: "Write content to a file, relative to the server's working directory — the file (and any missing parent directories) is created there.",
        schema: z.object({
            file_path: z.string(),
            content: z.string(),
        }),
    }
);
