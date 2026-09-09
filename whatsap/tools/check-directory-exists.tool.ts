import { tool } from "langchain";
import { z } from "zod";
import fs from "fs/promises";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

export const createCheckDirectoryExistsTool = (llm) => {
  const checkDirectoryExists = tool(
    async ({ directoryPath }, config) => {
      const fullPath = resolveDeviceScopedPath(config, directoryPath);
      try {
        const stats = await fs.stat(fullPath);
        const isDirectory = stats.isDirectory();
        return `${directoryPath} ${isDirectory ? "is" : "is not"} a directory (exists: ${isDirectory})`;
      } catch (error) {
        if (error.code === "ENOENT") {
          return `${directoryPath} is not a directory (does not exist)`;
        }
        throw error;
      }
    },
    {
      name: "check_directory_exists",
      description: "Check if a directory exists, relative to this device's own directory.",
      schema: z.object({
        directoryPath: z.string(),
      }),
    }
  );

  return checkDirectoryExists;
}
