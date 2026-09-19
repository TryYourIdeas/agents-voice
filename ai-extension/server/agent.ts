import "dotenv/config";
import { createAgent } from "langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { readFileSync } from "node:fs";

import { readFileTool } from "./tools/read-file.tool.ts";
import { writeFileTool } from "./tools/write-file.tool.ts";
import { listDirectoryTool } from "./tools/list-directory.tool.ts";
import { createDirectoryTool } from "./tools/create-directory.tool.ts";
import { executeBashTool } from "./tools/execute-bash.tool.ts";
import { skillMiddleware } from "./middleware/skill-middleware.ts";
import { logModelCallMiddleware } from "./middleware/log-model-call-middleware.ts";

if (!process.env.ANTHROPIC_MODEL) {
    throw new Error("ANTHROPIC_MODEL environment variable is required (e.g. claude-sonnet-5)");
}

const model = new ChatAnthropic({
    model: process.env.ANTHROPIC_MODEL,
    temperature: 0,
    maxRetries: 2,
});

const systemPrompt = readFileSync(new URL("./prompts/executer-system.md", import.meta.url), "utf-8");
const checkpointer = new MemorySaver();

const agent = createAgent({
    model,
    tools: [readFileTool, writeFileTool, listDirectoryTool, createDirectoryTool, executeBashTool],
    checkpointer,
    systemPrompt: new SystemMessage(systemPrompt),
    middleware: [skillMiddleware, logModelCallMiddleware],
});

function extractText(content: string | Array<{ type: string; text?: string }>): string {
    if (typeof content === "string") return content;
    return content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("\n");
}

// message is the user's chat text, already combined with any formatted page
// context (see context.ts) by the http layer before this is called.
export async function callAgent(message: string, threadId: string): Promise<string> {
    const result = await agent.invoke(
        { messages: [new HumanMessage(message)] },
        { recursionLimit: 100, configurable: { thread_id: threadId } }
    );
    const { messages } = result;
    return extractText(messages[messages.length - 1].content);
}
