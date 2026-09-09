/**
 * Lists all files in a given directory, relative to the calling device's
 * own directory (see lib/device-scoped-path.ts).
 */

import { tool } from "langchain";
import { z } from "zod";
import { existsSync, statSync, readdirSync } from "fs";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

export const createListDirectoryTool = (llm) => {
    const listDirectory = tool(
        async ({ directoryPath }, config) => {
          if (!directoryPath) {
            throw new Error('Directory path cannot be empty');
          }

          const fullPath = resolveDeviceScopedPath(config, directoryPath);

          if (!existsSync(fullPath)) {
            throw new Error(`Directory does not exist: ${directoryPath}`);
          }

          const stat = statSync(fullPath);
          if (!stat.isDirectory()) {
            throw new Error(`Path is not a directory: ${directoryPath}`);
          }

          const entries = readdirSync(fullPath);
          return entries.sort();
        },
        {
            name: "list_directory",
            description: "List all files and subdirectories in a given directory, relative to this device's own directory",
            schema: z.object({
                directoryPath: z.string().describe("Path to the directory to list files from")
            })
        }
    );
    return listDirectory;
};
