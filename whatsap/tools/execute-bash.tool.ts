import { tool } from "langchain";
import { z } from "zod";
import { exec } from "child_process";

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
      console.log("Executing bash command:", command);
      
      return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
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
      description: "Executes a bash command and returns the output. Use this for file operations, system queries, and other tasks that require command-line execution.",
      schema: bashUsage,
    }
  );
  
  return executeBash;
};

// Example usage:
// const executeBashTool = createExecuteBashTool();
// const result = await executeBashTool.invoke({ command: "ls -la" });