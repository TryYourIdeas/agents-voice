import { tool } from "langchain";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

export const downloadFileTool = tool(
  async ({ url, destination_path }, config) => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    const fileBuffer = await response.arrayBuffer();
    const fileContent = Buffer.from(fileBuffer);

    const fullPath = resolveDeviceScopedPath(config, destination_path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, fileContent);

    return `Successfully downloaded file from ${url} to ${destination_path}`;
  },
  {
    name: "download_file",
    description: "Download a file from a URL and save it, relative to this device's own directory. Use this to fetch files from the internet.",
    schema: z.object({
      url: z.string().url().describe("The URL of the file to download"),
      destination_path: z.string().describe("Where to save the file, relative to this device's own directory"),
    }),
  }
);
