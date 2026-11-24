import { createMiddleware, tool } from "langchain";
import { z } from "zod";
import { listAgentHeaders, callNamedAgent } from "../named-agents.ts";
import { parseDeviceThreadId } from "../lib/devices.ts";

// Lets the default agent hand off a task to a specialized named agent
// (agents/<name>/agent.md) instead of attempting it directly — mirrors
// skillMiddleware's shape (list what's available in the system prompt, give
// a tool to act on one of them), but for whole agents instead of skill docs.
//
// Only attached to the default agent (see agent.ts) — named agents don't get
// this middleware, so delegation can't chain into a loop (agent A delegating
// to agent B delegating back to A, etc). Because delegation only ever
// happens FROM the default agent, the incoming thread id here is always the
// default-agent form ("device:<name>:<chatId>"), never an "agent:" form —
// parsed.rest below is therefore always a safe, un-prefixed chatId to hand
// to callNamedAgent.
// Exported for tests. Worded as a routing rule, not a suggestion: the default
// agent should reach for a specialist first and only do the work itself when
// no specialist fits.
export function buildAgentsAddendum(headers: { name: string; description: string }[]): string {
    return (
        `\n\n## Available Agents (specialist sub-agents)\n\n` +
        `These are specialist agents you can call with the delegate_to_agent tool, the same way you call any other tool:\n\n` +
        headers.map((h) => `- **${h.name}**: ${h.description}`).join("\n") +
        `\n\n### Routing rule\n` +
        `Before doing any work yourself, compare the user's request with each agent's description above. ` +
        `If any agent is better suited to the task, even partly, you MUST call delegate_to_agent with that agent's name ` +
        `and a self-contained task, then relay its answer. Do this FIRST, before searching files, memory or the web.\n` +
        `- A request about something you have no context for (e.g. "that email", "the ACIF message", "my tasks") ` +
        `probably belongs to a specialist that owns that data: delegate instead of hunting for it in files.\n` +
        `- Specialists keep their own conversation history, so follow-up questions on a topic you delegated earlier ` +
        `should go to the same agent again.\n` +
        `- If the request spans several agents, delegate each part separately and combine the answers.\n` +
        `- Only handle the request yourself when no agent's description fits.`
    );
}

export type RunNamedAgent = (device: string, agentName: string, task: string, chatId: string) => Promise<string>;

/**
 * The default agent's delegate_to_agent tool + routing addendum. The runner is injected so a replay can run the
 * named agent with the replay model and mock tools (lib/replay/delegate.ts) instead of callNamedAgent's real ones.
 */
export function createAgentDelegationMiddleware(runAgent: RunNamedAgent) {
    return createMiddleware({
        name: "agentDelegationMiddleware",
        tools: [
            tool(
                async ({ agentName, task }: { agentName: string; task: string }, config) => {
                    console.log(`[delegate_to_agent] -> ${agentName}: ${task}`);
                    const threadId = config?.configurable?.thread_id as string | undefined;
                    const parsed = threadId ? parseDeviceThreadId(threadId) : undefined;
                    if (!parsed) {
                        return `Could not delegate to '${agentName}': could not determine which device this conversation belongs to.`;
                    }
                    try {
                        return await runAgent(parsed.device, agentName, task, parsed.rest);
                    } catch (err: any) {
                        const available = listAgentHeaders().map((h) => h.name).join(", ") || "(none configured)";
                        return `Could not delegate to '${agentName}': ${err?.message || err}. Available agents: ${available}`;
                    }
                },
                {
                    name: "delegate_to_agent",
                    description: "Call a specialist sub-agent (see Available Agents in your system prompt) and get its answer back. Use this FIRST whenever a specialist's description fits the task, even partly, instead of attempting the task yourself or searching files for context.",
                    schema: z.object({
                        agentName: z.string().describe("The name of the agent to delegate to (see Available Agents)"),
                        task: z.string().describe("The task or message to send to that agent, with enough detail for it to act without further context"),
                    }),
                }
            ),
        ],
        wrapModelCall: async (request, handler) => {
            const headers = listAgentHeaders();
            if (headers.length === 0) {
                return handler(request);
            }

            const agentsAddendum = buildAgentsAddendum(headers);

            // Same systemMessage-not-systemPrompt caveat as skillMiddleware — see
            // its comment for why.
            return handler({
                ...request,
                systemMessage: request.systemMessage.concat(agentsAddendum),
            });
        },
    });
}

export const agentDelegationMiddleware = createAgentDelegationMiddleware((device, agentName, task, chatId) => callNamedAgent(device, agentName, task, chatId));
