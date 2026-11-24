// lib/replay/delegate.ts
//
// What delegate_to_agent does inside a replay: run the named agent (its own agent.md prompt, skills and
// allowed-tools) with the REPLAY model and the sandbox's mock tools, logged as a child turn of the replay.
// Each named agent is built once per replay, so follow-up delegations keep that agent's conversation.

import { loggedTurn } from "../agent-logs.ts";

export interface ReplayDelegateDeps {
    reasoningModel: string;
    buildAgent: (agentName: string) => Promise<any>;
    invoke: (ctx: { agent: any; message: string; threadId: string; device: string }) => Promise<string>;
}

export function createReplayDelegate({ reasoningModel, buildAgent, invoke }: ReplayDelegateDeps) {
    const agents = new Map<string, Promise<any>>();
    return async (device: string, agentName: string, task: string, chatId: string): Promise<string> => {
        try {
            let agent = agents.get(agentName);
            if (!agent) {
                agent = buildAgent(agentName);
                agents.set(agentName, agent);
                agent.catch(() => agents.delete(agentName));
            }
            const built = await agent;
            const threadId = `device:${device}:agent:${agentName}:${chatId}`;
            return await loggedTurn(
                { device, chatId, threadId, agent: agentName, model: reasoningModel, reasoningModel, userMessage: task },
                () => invoke({ agent: built, message: task, threadId, device })
            );
        } catch (err: any) {
            return `Could not delegate to '${agentName}': ${err?.message || err}`;
        }
    };
}
