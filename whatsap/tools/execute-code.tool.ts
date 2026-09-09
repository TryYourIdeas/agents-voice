import { tool } from "langchain";
import { z } from "zod";
import { exec } from "child_process";


const codeUsage = z.object({
  comments: z.string(),
  filename: z.string(),
  code: z.string(),
  examples: z.string(),
});


export const createExecuteCodeTool = (llm) => {
    const executeCode = tool(
        ({ filename }, config) => {
            console.log("Executing file:", filename);
            return new Promise((resolve, reject) => {

            exec(`node ./${filename}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                reject( stderr + error);
            }
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
                resolve(stdout);
            });
        });
        },
        {
            name: "execute_file",
            description: "Executes TypeScript file and returns the output.",
            schema: z.object({
            filename: z.string(),
            }),
        }
    );      
    return executeCode;
}