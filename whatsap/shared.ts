import "dotenv/config";
import { ChatAnthropic } from "@langchain/anthropic";
import { MemorySaver } from "@langchain/langgraph";

// import { createExecuteCodeTool } from "./tools/execute-code.tool.ts";
import { readFileTool } from "./tools/read-file.tool.ts";
import { writeFileTool } from "./tools/write-file.tool.ts";
import { createListDirectoryTool } from "./tools/list-directory.tools.ts";
import { createCheckDirectoryExistsTool } from "./tools/check-directory-exists.tool.ts";
import { createCreateDirectoryTool } from "./tools/create-directory.tool.ts";
import { createExecuteBashTool } from "./tools/execute-bash.tool.ts";
import { downloadFileTool } from "./tools/downloadFile.tool.ts";
import { fetchUrlTool } from "./tools/fetch-url.tool.ts";
import { webSearch } from "./tools/web-search.tool.ts";
import { renderDiagramTool } from "./tools/render-diagram.tool.ts";
import { createScheduledTaskTool } from "./tools/create-scheduled-task.tool.ts";
import { listScheduledTasksTool } from "./tools/list-scheduled-tasks.tool.ts";
import { cancelScheduledTaskTool } from "./tools/cancel-scheduled-task.tool.ts";
import { getCurrentChatTool } from "./tools/get-current-chat.tool.ts";

// Split out of agent.ts so named-agents.ts (which agent.ts's delegation
// middleware needs) and agent.ts itself can both depend on the model/tools
// without agent.ts and named-agents.ts importing each other.

if (!process.env.ANTHROPIC_MODEL) {
    throw new Error("ANTHROPIC_MODEL environment variable is required (e.g. claude-sonnet-5)");
}

export const model = new ChatAnthropic({
    model: process.env.ANTHROPIC_MODEL,
    temperature: 0,
    maxRetries: 2,
    // Shared by every agent (default + named) since they all reuse this
    // one model instance. Also caps llama-server's own generation via
    // start-llama-server.sh / start-llama-server-gpu.sh's -n flag.
    maxTokens: process.env.MAX_TOKENS ? Number(process.env.MAX_TOKENS) : undefined,
    // A high maxTokens makes the Anthropic SDK refuse non-streaming calls
    // outright ("Streaming is required for operations that may take longer
    // than 10 minutes") since it can't rule out that worst case. Streaming
    // is the SDK's own documented fix; agent.invoke() collects the stream
    // into the same final result either way, so no other code changes.
    streaming: true,
});

// const executeCodeTool = createExecuteCodeTool(model);
const listDirectoryTool = createListDirectoryTool(model);
const checkDirectoryExistsTool = createCheckDirectoryExistsTool(model);
const createDirectoryTool = createCreateDirectoryTool(model);
const executeBashTool = createExecuteBashTool();

export const sharedTools = [readFileTool, writeFileTool, listDirectoryTool, checkDirectoryExistsTool, createDirectoryTool, executeBashTool, downloadFileTool, fetchUrlTool, webSearch, renderDiagramTool, createScheduledTaskTool, listScheduledTasksTool, cancelScheduledTaskTool, getCurrentChatTool];
export const sharedCheckpointer = new MemorySaver();
