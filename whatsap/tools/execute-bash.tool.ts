import { tool } from "langchain";
import { z } from "zod";
import { exec } from "child_process";
import fs from "node:fs";
import { resolveDeviceCwd } from "../lib/device-scoped-path.ts";

/**
 * Tool to execute bash commands and return the output.
 * This tool allows the agent to run shell commands for file operations,
 * system queries, and other tasks that require command-line execution.
 */
const bashUsage = z.object({
  command: z.string()
    .describe("The bash command to execute"),
});

export const createExecuteBashTool = () => {
  const executeBash = tool(
    ({ command }, config) => {
      // Same root as the file tools (read_file, list_directory, ...): the calling
      // device's own directory. Without this the shell started in the app root,
      // so `find ai-news` failed while list_directory("ai-news") worked, and
      // models looped trying to reconcile the two.
      const cwd = resolveDeviceCwd(config);
      if (cwd) fs.mkdirSync(cwd, { recursive: true });
      console.log("Executing bash command:", command, cwd ? `(cwd: ${cwd})` : "");
      
      return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 10 * 1024 * 1024, cwd }, (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
            reject(stderr + error);
          }
          console.log(`stdout: ${stdout}`);
          console.error(`stderr: ${stderr}`);
          
          // Return both stdout and stderr for debugging
          const output = stderr ? `${stderr}\n${stdout}` : stdout;
          resolve(output);
        });
      });
    },
    {
      name: "execute_bash",
      description: "Executes a bash command and returns the output. It runs in your device folder, the same root the file tools use, so relative paths mean the same thing in both (e.g. `tasks/x.md`, not `devices/<name>/tasks/x.md`). Use this for file operations, system queries, and other tasks that require command-line execution.",
      schema: bashUsage,
    }
  );
  
  return executeBash;
};

// Example usage:
// const executeBashTool = createExecuteBashTool();
// const result = await executeBashTool.invoke({ command: "ls -la" });