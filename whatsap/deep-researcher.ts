import { createDeepAgent } from "deepagents";
import { ChatOllama } from "@langchain/ollama";
import { webSearch } from "./tools/web-search.tool.ts";
import { readFileTool } from "./tools/read-file.tool.ts";
import { writeFileTool } from "./tools/write-file.tool.ts";


export const localModel = new ChatOllama({
    model: "qwen3.5:9b", // "qwen3.5:9b",
    temperature: 0,
    maxRetries: 2,
    numCtx: 128535,
    // other params...
})


const agent = createDeepAgent({
  model: localModel,
  tools: [webSearch, readFileTool, writeFileTool], // tool names as strings
  systemPrompt: "You are a research assistant.",
});

const result = await agent.invoke({
  messages: [
    {
      role: "user",
      content: ` read the file ./research-topic.md and do what it says. 
      Use the 'my_read_file' tool to read the file and the 'my_write_file' tool to write your findings to deep-agents.md. 
      If you need to search the web for more information, use the 'web_search' tool. 
      Be sure to write detailed notes of your research process and findings in deep-agents.md.`,
      // content: "Research creating and extending deepagents in typescript LangGraph and write a summary in deep-agents.md",
    },
  ],
});
console.log("Agent result:", result);