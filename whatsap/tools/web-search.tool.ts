import { createWebSearchTool } from "langchain-agent-kit";
import { tool } from "langchain";
import { recordSearch, duplicateSearchMessage } from "../lib/search-dedupe.ts";
import fs from "node:fs";
import path from "node:path";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

// initialize search with a year-month-day-hour to avoid collisions in caching or tracking
let searchCountBase = new Date().getTime();
let searchCount = 0;

const rawWebSearch = createWebSearchTool({
    onResult: (args, result, config) => {
        searchCount++;

        // store in this device's own research directory (see
        // lib/device-scoped-path.ts) with a filename based on the search base
        // and research count
        const researchDir = resolveDeviceScopedPath(config, "research");
        fs.mkdirSync(researchDir, { recursive: true });
        const resultFileName = `${searchCountBase}_${searchCount}_results.json`;
        fs.writeFileSync(path.join(researchDir, resultFileName), JSON.stringify(result, null, 2));

        // store the query about the search with the same filename format but with query instead of results
        const queryFileName = `${searchCountBase}_${searchCount}_query.json`;
        fs.writeFileSync(
            path.join(researchDir, queryFileName),
            JSON.stringify({ query: args.query, topic: args.topic }, null, 2)
        );
    },
});

// Same name and schema as the kit's tool, plus a per-thread guard that answers
// repeated identical queries with a nudge instead of searching again.
export const webSearch = tool(
    async (input, config) => {
        const repeats = recordSearch(config?.configurable?.thread_id as string | undefined, input.query, input.topic);
        if (repeats !== undefined) {
            console.warn(`[web_search] duplicate query suppressed (seen ${repeats}x): "${input.query}"`);
            return duplicateSearchMessage(input.query, repeats);
        }
        return rawWebSearch.invoke(input, config);
    },
    { name: rawWebSearch.name, description: rawWebSearch.description, schema: rawWebSearch.schema as any }
);
