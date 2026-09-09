import { tool } from "langchain";
import { z } from "zod";
import fs from "fs/promises";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

export const createCreateDirectoryTool = (llm) => {
  const createDirectory = tool(
    async ({ directoryPath }, config) => {
      const fullPath = resolveDeviceScopedPath(config, directoryPath);
      await fs.mkdir(fullPath, { recursive: true });
      return `Successfully created directory: ${directoryPath}`;
    },
    {
      name: "create_directory",
      description: "Create a directory, relative to this device's own directory.",
      schema: z.object({
        directoryPath: z.string(),
      }),
    }
  );

  return createDirectory;
}
