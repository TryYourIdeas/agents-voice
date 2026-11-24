// tools/replay/web-search.ts
//
// The real web_search tool writes every result to the device's research/ directory on the real disk.
// In a replay the search itself stays real (read-only network) but the research files go to the sandbox.

import { createWebSearchTool } from "langchain-agent-kit";
import { tool } from "langchain";
import type { Sandbox } from "../../lib/replay/sandbox.ts";

export function replayResearchSink(sb: Sandbox) {
    let n = 0;
    const base = Date.now();
    return (args: { query?: string; topic?: string }, result: unknown) => {
        n++;
        sb.files.set(`research/${base}_${n}_results.json`, JSON.stringify(result, null, 2));
        sb.files.set(`research/${base}_${n}_query.json`, JSON.stringify({ query: args.query, topic: args.topic }, null, 2));
    };
}

export function createReplayWebSearch(sb: Sandbox) {
    const sink = replayResearchSink(sb);
    const raw = createWebSearchTool({ onResult: (args: any, result: any) => sink(args, result) });
    return tool(async (input: any, config: any) => raw.invoke(input, config), {
        name: raw.name,
        description: raw.description,
        schema: raw.schema as any,
    });
}
