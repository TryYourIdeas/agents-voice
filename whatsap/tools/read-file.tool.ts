import { tool } from "langchain";
import { z } from "zod";
import fs from "fs/promises";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

export const readFileTool = tool(
      async ({ file_path }, config) => {
        const fullPath = resolveDeviceScopedPath(config, file_path);
        const fileContents = await fs.readFile(fullPath, "utf-8");
        return fileContents;
      },
      {
        name: "my_read_file",
        description: "Read a file, relative to this device's own directory, and return its content.",
        schema: z.object({
          file_path: z.string(),
        }),
      }
    );
