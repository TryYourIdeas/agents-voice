import { tool } from "langchain";
import { z } from "zod";
import fs from "fs/promises";

export const checkFileExists = tool(
    async ({ filePath }, config) => {
      console.log(config)
      console.log("Checking if file exists:", filePath);
      // check if a file exists in the current directory 
      const fullPath = `./${filePath}`;
      try {
        const stats = await fs.stat(fullPath);
        const isFile = stats.isFile();
        const writer = config.writer;

        // Stream custom updates as the tool executes
        if (writer) {
          writer(`Checking file existence for: ${filePath}`);
        }

        return `${filePath} ${isFile ? "is" : "is not"} a file (exists: ${isFile})`;
      } catch (error) {
        if (error.code === "ENOENT") {
          const writer = config.writer;

          // Stream custom updates as the tool executes
          if (writer) {
            writer(`File check for: ${filePath} - file does not exist`);
          }

          return `${filePath} is not a file (does not exist)`;
        }
        throw error;
      }
    },
    {
      name: "check_file_exists",
      description: "Check if a file exists in the local system.",
      schema: z.object({
        filePath: z.string(),
      }),
    }
  );

export const createCheckFileExistsTool = (llm) => {
  

  return checkFileExists;
}