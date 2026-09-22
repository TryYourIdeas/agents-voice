import { createWebSearchTool } from "langchain-agent-kit";
import fs from "node:fs";
import path from "node:path";
import { resolveDeviceScopedPath } from "../lib/device-scoped-path.ts";

// initialize search with a year-month-day-hour to avoid collisions in caching or tracking
let searchCountBase = new Date().getTime();
let searchCount = 0;

export const webSearch = createWebSearchTool({
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
