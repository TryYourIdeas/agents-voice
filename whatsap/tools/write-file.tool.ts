import { tool } from "langchain";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

export const writeFileTool = tool(
  async ({ file_path, content }, config) => {
    const fullPath = resolveDeviceScopedPath(config, file_path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    return `Successfully wrote to file: ${file_path}`;
  },
  {
    name: "my_write_file",
    description: "Write content to a file, relative to this device's own directory — the file (and any missing parent directories) is created there.",
    schema: z.object({
      file_path: z.string(),
      content: z.string(),
    }),
  }
);
