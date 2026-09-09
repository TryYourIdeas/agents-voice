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
export const agentDelegationMiddleware = createMiddleware({
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
                    return await callNamedAgent(parsed.device, agentName, task, parsed.rest);
                } catch (err: any) {
                    const available = listAgentHeaders().map((h) => h.name).join(", ") || "(none configured)";
                    return `Could not delegate to '${agentName}': ${err?.message || err}. Available agents: ${available}`;
                }
            },
            {
                name: "delegate_to_agent",
                description: "Hand off a task to a specialized agent that's better suited to it than you are — see the Available Agents list in your system prompt for what's available and what each is for. Prefer this over attempting a task yourself when it clearly matches one of those agents' descriptions.",
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

        const agentsAddendum =
            `\n\n## Available Agents\n\n` +
            headers.map((h) => `- **${h.name}**: ${h.description}`).join("\n") +
            `\n\nIf the user's request is a better match for one of these agents than a general ` +
            `task, use the delegate_to_agent tool to hand it off rather than attempting it ` +
            `yourself. Otherwise, handle the request directly as usual.`;

        // Same systemMessage-not-systemPrompt caveat as skillMiddleware — see
        // its comment for why.
        return handler({
            ...request,
            systemMessage: request.systemMessage.concat(agentsAddendum),
        });
    },
});
