import { createAgent } from "langchain";
import { HumanMessage, SystemMessage, type MessageContent } from "@langchain/core/messages";
import { readFileSync } from "fs";

import { model, sharedTools, sharedCheckpointer } from "./shared.ts";
import { skillMiddleware } from "./middleware/skill-middleware.ts";
import { createMemoryMiddleware } from "./middleware/memory-middleware.ts";
import { agentDelegationMiddleware } from "./middleware/agent-delegation-middleware.ts";
import { logModelCallMiddleware } from "./middleware/log-model-call-middleware.ts";
import { extractText } from "./util.ts";

export { model } from "./shared.ts";
export { listAvailableAgents, callNamedAgent, clearSession } from "./named-agents.ts";

const executerSystemPrompt = readFileSync("./prompts/executer-system.md", "utf-8");

// One default-agent instance per device — each needs its own
// createMemoryMiddleware scoped to that device's own memory directory (see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md).
const defaultAgents = new Map<string, ReturnType<typeof createAgent>>();

function getDefaultAgent(deviceName: string): ReturnType<typeof createAgent> {
    const cached = defaultAgents.get(deviceName);
    if (cached) return cached;

    const agent = createAgent({
        model: model,
        tools: sharedTools,
        checkpointer: sharedCheckpointer,
        systemPrompt: new SystemMessage(executerSystemPrompt),

        // agentDelegationMiddleware only goes on the default agent — named
        // agents (see named-agents.ts) don't get it, so delegation can't chain
        // into a loop.
        middleware: [
            skillMiddleware,
            createMemoryMiddleware(`devices/${deviceName}/memory`),
            agentDelegationMiddleware,
            logModelCallMiddleware,
        ],
    });
    defaultAgents.set(deviceName, agent);
    return agent;
}

export async function callAgent(deviceName: string, content: MessageContent, localThreadId: string): Promise<string> {
    const agent = getDefaultAgent(deviceName);
    const result = await agent.invoke(
        { messages: [new HumanMessage(content)] },
        {
            recursionLimit: 100,
            // Every conversation thread id is wrapped in a "device:<name>:"
            // prefix — constructed here, once, rather than by every caller —
            // see the design doc's "Multi-Client Refactor" section.
            configurable: { thread_id: `device:${deviceName}:${localThreadId}` },
        }
    );
    const { messages: updatedMessages } = result;
    return extractText(updatedMessages[updatedMessages.length - 1].content);
}
