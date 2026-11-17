import { createMessageTypeTraceMiddleware } from "./lib/message-trace.ts";
import { createAgent } from "langchain";
import { HumanMessage, SystemMessage, type MessageContent } from "@langchain/core/messages";
import { readFileSync } from "fs";

import { model, visionModel, sharedTools, sharedCheckpointer } from "./shared.ts";
import { createVisionRoutingMiddleware } from "./lib/vision-routing.ts";
import { datetimeMiddleware } from "./middleware/datetime-middleware.ts";
import { createMemoryMiddleware } from "./middleware/memory-middleware.ts";
import { agentDelegationMiddleware } from "./middleware/agent-delegation-middleware.ts";
import { agentLogsMiddleware } from "./middleware/agent-logs-middleware.ts";
import { loggedTurn } from "./lib/agent-logs.ts";
import { extractText, agentRecursionLimit, isRecursionLimitError, RECURSION_LIMIT_REPLY } from "./util.ts";
import { createSkillMiddleware, createLogModelCallMiddleware } from "langchain-agent-kit";

export { model } from "./shared.ts";
export { listAvailableAgents, callNamedAgent, clearSession } from "./named-agents.ts";

const skillMiddleware = createSkillMiddleware("./skills");
const logModelCallMiddleware = createLogModelCallMiddleware({ prefix: "[Middleware]" });
const messageTypeTraceMiddleware = createMessageTypeTraceMiddleware({ prefix: "[Middleware]" });
const visionRoutingMiddleware = createVisionRoutingMiddleware(visionModel);

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
            datetimeMiddleware,
            agentDelegationMiddleware,
            visionRoutingMiddleware,
            logModelCallMiddleware,
            messageTypeTraceMiddleware,
            agentLogsMiddleware,
        ],
    });
    defaultAgents.set(deviceName, agent);
    return agent;
}

export function callAgent(deviceName: string, content: MessageContent, localThreadId: string, opts?: { recursionLimit?: number }): Promise<string> {
    return loggedTurn(
        { device: deviceName, chatId: localThreadId, threadId: `device:${deviceName}:${localThreadId}`, agent: "default", model: process.env.ANTHROPIC_MODEL, userMessage: content },
        () => runDefaultAgent(deviceName, content, localThreadId, opts),
        RECURSION_LIMIT_REPLY
    );
}

async function runDefaultAgent(deviceName: string, content: MessageContent, localThreadId: string, opts?: { recursionLimit?: number }): Promise<string> {
    const agent = getDefaultAgent(deviceName);
    let result;
    try {
        result = await agent.invoke(
        { messages: [new HumanMessage(content)] },
        {
            recursionLimit: opts?.recursionLimit ?? agentRecursionLimit(),
            // Every conversation thread id is wrapped in a "device:<name>:"
            // prefix — constructed here, once, rather than by every caller —
            // see the design doc's "Multi-Client Refactor" section.
            configurable: { thread_id: `device:${deviceName}:${localThreadId}` },
        }
        );
    } catch (err) {
        if (!isRecursionLimitError(err)) throw err;
        console.error(`[${deviceName}] [debug] callAgent hit the recursion limit (${agentRecursionLimit()}); replying with a fallback`);
        return RECURSION_LIMIT_REPLY;
    }
    const { messages: updatedMessages } = result;
    return extractText(updatedMessages[updatedMessages.length - 1].content);
}
