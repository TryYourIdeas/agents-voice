import "dotenv/config";
import { z } from "zod";
import { tool } from "langchain";
import { TavilySearch } from "@langchain/tavily";
import fs from "node:fs";
import path from "node:path";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";


type Topic = "general" | "news" | "finance";

// initialize search with a year-month-day-hour to avoid collisions in caching or tracking
let searchCountBase = new Date().getTime();
let searchCount = 0;
// Search tool to use to do research
export const webSearch = tool(
  async (
    {
      query,
      maxResults = 5,
      topic = "general" as Topic,
      includeRawContent = false,
    }: {
      query: string;
      maxResults?: number;
      topic?: Topic;
      includeRawContent?: boolean;
    },
    config
  ) => {
    // Increment search count for persistent tracking
    searchCount++;

    console.log(`🔍 Running internet search for query: "${query}" with maxResults=${maxResults}, topic=${topic}, includeRawContent=${includeRawContent}`);
    /**
     * 
     * Run a web search
     */

    // Note: You'll need to install and import tavily-js or similar package
    // For now, this is a placeholder that shows the structure
    const tavilySearch = new TavilySearch({
      maxResults,
      tavilyApiKey: process.env.TAVILY_API_KEY,
      includeRawContent,
      topic,
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Type instantiation is excessively deep and possibly infinite.
    const tavilyResponse = await tavilySearch._call({ query });
    console.log(`🔍 Search results for query: "${query}":`, tavilyResponse);

    // store in this device's own research directory (see
    // lib/device-scoped-path.ts) with a filename based on the search base
    // and research count
    const researchDir = resolveDeviceScopedPath(config, "research");
    fs.mkdirSync(researchDir, { recursive: true });
    const resultFileName = `${searchCountBase}_${searchCount}_results.json`;
    fs.writeFileSync(path.join(researchDir, resultFileName), JSON.stringify(tavilyResponse, null, 2));

    // store the query about the search with the same filename format but with query instead of results
    const queryFileName = `${searchCountBase}_${searchCount}_query.json`;
    fs.writeFileSync(path.join(researchDir, queryFileName), JSON.stringify({ query, topic }, null, 2));
    
    return tavilyResponse;
  },
  {
    name: "web_search",
    description: "Run a web search",
    schema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of results to return"),
      topic: z
        .enum(["general", "news", "finance"])
        .optional()
        .default("general")
        .describe("Search topic category"),
      includeRawContent: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to include raw content"),
    }),
  },
);
