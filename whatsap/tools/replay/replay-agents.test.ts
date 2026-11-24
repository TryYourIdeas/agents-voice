import { describe, it, expect } from "vitest";
import { createReplayTools } from "./index.ts";
import { createReplayWebSearch } from "./web-search.ts";
import { Sandbox } from "../../lib/replay/sandbox.ts";
import { fetchUrlTool } from "../fetch-url.tool.ts";
import { getCurrentDatetimeTool } from "../get-current-datetime.tool.ts";
import { listAvailableAgents, readAgentHeader, listAvailableAgentsTool } from "../../named-agents.ts";

// Guards against drift: a named agent's allowed-tools must each exist in a replay (as a mock or a deliberate
// read-only real tool), otherwise a replayed agent silently loses a tool its prompt relies on.
describe("replay tools cover every named agent's allowed-tools", () => {
    const sb = new Sandbox();
    const names = new Set(
        createReplayTools(sb, { webSearch: createReplayWebSearch(sb) as any, fetchUrl: fetchUrlTool as any, getCurrentDatetime: getCurrentDatetimeTool as any, listAvailableAgents: listAvailableAgentsTool as any }).map((t: any) => t.name)
    );
    for (const agent of listAvailableAgents()) {
        const allowed = readAgentHeader(agent)?.allowedTools;
        if (!allowed) continue;
        it(`${agent}: every allowed tool is available in a replay`, () => {
            expect(allowed.filter((t) => !names.has(t))).toEqual([]);
        });
    }
});
