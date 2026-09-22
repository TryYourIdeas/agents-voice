import { tool } from "langchain";
import { z } from "zod";
import { exec } from "node:child_process";

export const executeBashTool = tool(
    ({ command }) => {
        return new Promise<string>((resolve, reject) => {
            exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    reject(stderr || error.message);
                    return;
                }
                resolve(stderr ? `${stderr}\n${stdout}` : stdout);
            });
        });
    },
    {
        name: "execute_bash",
        description: "Executes a bash command in the server's working directory and returns the output.",
        schema: z.object({
            command: z.string().describe("The bash command to execute"),
        }),
    }
);
