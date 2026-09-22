import { z } from "zod";
import { tool } from "langchain";
import { TavilySearch } from "@langchain/tavily";
import type { ToolRunnableConfig } from "@langchain/core/tools";

export type WebSearchTopic = "general" | "news" | "finance";

export interface WebSearchArgs {
    query: string;
    maxResults: number;
    topic: WebSearchTopic;
    includeRawContent: boolean;
}

// Builds a Tavily-backed web_search tool. onResult, when given, is awaited
// after a successful search with the resolved args, the raw Tavily
// response, and the tool's own RunnableConfig — e.g. so a caller needing
// device-scoped persistence (see whatsap/tools/web-search.tool.ts) can read
// whatever it needs off config without this module knowing what a "device"
// is. Omit it to just return the result, no side effects (ai-extension's
// case).
export function createWebSearchTool(opts?: {
    onResult?: (args: WebSearchArgs, result: unknown, config: ToolRunnableConfig) => void | Promise<void>;
}) {
    return tool(
        async (
            {
                query,
                maxResults = 5,
                topic = "general" as WebSearchTopic,
                includeRawContent = false,
            }: {
                query: string;
                maxResults?: number;
                topic?: WebSearchTopic;
                includeRawContent?: boolean;
            },
            config
        ) => {
            console.log(
                `Running web search for query: "${query}" with maxResults=${maxResults}, topic=${topic}, includeRawContent=${includeRawContent}`
            );

            const tavilySearch = new TavilySearch({
                maxResults,
                tavilyApiKey: process.env.TAVILY_API_KEY,
                includeRawContent,
                topic,
            });
            const result = await tavilySearch._call({ query });

            if (opts?.onResult) {
                await opts.onResult({ query, maxResults, topic, includeRawContent }, result, config);
            }

            return result;
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
        }
    );
}
