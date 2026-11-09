import { tool } from "langchain";
import { z } from "zod";
import { readFileSlice } from "../lib/read-file-slice.ts";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

export const readFileTool = tool(
      async ({ file_path, offset }, config) => {
        const fullPath = resolveDeviceScopedPath(config, file_path);
        return readFileSlice(fullPath, offset);
      },
      {
        name: "my_read_file",
        description: "Read a file, relative to this device's own directory, and return its content. Large files are returned in pieces of about 20 KB: if the result ends with a [truncated ...] notice, call again with the given offset (in bytes) to continue. Never read logs.txt or other big files whole; use execute_bash (grep/tail) to search them.",
        schema: z.object({
          file_path: z.string(),
          offset: z.number().int().min(0).optional().describe("Byte offset to start reading from (default 0)."),
        }),
      }
    );
