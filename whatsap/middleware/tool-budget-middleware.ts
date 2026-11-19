import { createMiddleware } from "langchain";
import { isScheduledRun } from "../lib/agent-logs.ts";
import { toolCallBudget } from "../util.ts";

// Hard stop for runaway research. The system prompt asks the agent to stop after ~6 searches, but small models
// ignore it and keep paging through documents until the recursion limit ends the request with "stuck looping"
// and no answer at all (agent log turns 13 and 16). Once a request has used its tool-call budget this
// middleware forbids further tool calls (toolChoice "none") and tells the model to answer with what it found.
// The budget counts tool results since the user's latest message, so a follow-up starts fresh.
export function toolCallsThisRequest(messages: any[]): number {
    let n = 0;
    for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
        const type = typeof messages[i]?.getType === "function" ? messages[i].getType() : messages[i]?.type;
        if (type === "human") break;
        if (type === "tool") n++;
    }
    return n;
}

export const toolBudgetNote = (used: number) =>
    `\n\n## Tool budget used up\n\nYou have already made ${used} tool calls for this request and may not make any more. ` +
    `Write your final answer now using only what you have already found. Say clearly what you found, what you ` +
    `could not find, and what the user could provide or ask next (e.g. an exact model number, a document link). ` +
    `Do not mention this budget.`;

export const toolBudgetMiddleware = createMiddleware({
    name: "toolBudgetMiddleware",
    wrapModelCall: async (request, handler) => {
        const used = toolCallsThisRequest((request as any).state?.messages ?? (request as any).messages ?? []);
        if (used < toolCallBudget(isScheduledRun())) return handler(request);
        console.warn(`[tool-budget] ${used} tool calls used; forcing a final answer`);
        return handler({
            ...request,
            toolChoice: "none",
            systemMessage: request.systemMessage.concat(toolBudgetNote(used)),
        } as any);
    },
});
