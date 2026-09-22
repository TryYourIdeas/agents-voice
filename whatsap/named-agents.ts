import { readFileSync, readdirSync, existsSync } from "fs";
import path from "node:path";
import { createAgent, tool } from "langchain";
import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { model, sharedTools, sharedCheckpointer } from "./shared.ts";
import { createMemoryMiddleware } from "./middleware/memory-middleware.ts";
import { extractText } from "./util.ts";
import {
    createSkillMiddleware,
    createLogModelCallMiddleware,
    parseFrontmatter,
    parseMetadataField,
    parseMetadataListField,
} from "langchain-agent-kit";

const logModelCallMiddleware = createLogModelCallMiddleware({ prefix: "[Middleware]" });

// Named agents (whatsap/agents/<name>/agent.md) — each one is its own
// createAgent instance per device (see agent.ts's getDefaultAgent for the
// same reasoning), with its own system prompt, optionally its own skills
// (agents/<name>/skills/*/SKILL.md layered on top of the global ./skills),
// and optionally restricted to a subset of the shared tools.
//
// Split out of agent.ts specifically so agent.ts's delegation middleware
// (middleware/agent-delegation-middleware.ts, which needs callNamedAgent and
// listAgentHeaders) doesn't create a circular import with agent.ts.
//
// Directory names double as agent identifiers, so they're validated the same
// way voice IDs are in text-to-speech (_VOICE_ID_RE) to rule out path
// traversal (e.g. "../../etc/passwd") before ever touching the filesystem.
const AGENTS_DIR = "./agents";
const AGENT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

interface AgentHeader {
    name: string;
    description: string;
    // undefined = no restriction (every shared tool / every discovered
    // skill); [] = explicitly none. See frontmatter.ts's
    // parseMetadataListField for why those two cases are distinguished.
    allowedTools?: string[];
    allowedSkills?: string[];
    content: string;
}

function parseAgentFile(fileText: string, fallbackName: string): AgentHeader {
    const { metadata, content } = parseFrontmatter(fileText);
    const name = parseMetadataField(metadata, "name") || fallbackName;
    const description = parseMetadataField(metadata, "description") || "";
    const allowedTools = parseMetadataListField(metadata, "allowed-tools");
    const allowedSkills = parseMetadataListField(metadata, "allowed-skills");
    return { name, description, allowedTools, allowedSkills, content };
}

function readAgentHeader(agentName: string): AgentHeader | undefined {
    const agentMdPath = path.join(AGENTS_DIR, agentName, "agent.md");
    if (!existsSync(agentMdPath)) return undefined;
    return parseAgentFile(readFileSync(agentMdPath, "utf-8"), agentName);
}

export function listAvailableAgents(): string[] {
    if (!existsSync(AGENTS_DIR)) return [];
    return readdirSync(AGENTS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(path.join(AGENTS_DIR, entry.name, "agent.md")))
        .map((entry) => entry.name);
}

// name + description for every available agent — what the delegation
// middleware shows the default agent, mirroring how skillMiddleware shows
// name + description for every available skill. Agent *definitions* are
// global (not per-device) — only their runtime instances (below) are.
export function listAgentHeaders(): { name: string; description: string }[] {
    return listAvailableAgents()
        .map((name) => readAgentHeader(name))
        .filter((h): h is AgentHeader => Boolean(h))
        .map(({ name, description }) => ({ name, description }));
}

// A named-agent-only tool (not part of sharedTools/shared.ts, which would
// create a circular import — this file already imports shared.ts for
// model/sharedTools/sharedCheckpointer) for discovering other named agents.
// Needed because list_directory became device-scoped (see
// lib/device-scoped-path.ts) and can no longer point at the global ./agents
// directory the way task-scheduler's agent.md previously relied on.
const listAvailableAgentsTool = tool(
    async () => {
        const headers = listAgentHeaders();
        if (headers.length === 0) {
            return "No named agents are currently configured.";
        }
        return headers.map((h) => `- ${h.name}: ${h.description}`).join("\n");
    },
    {
        name: "list_available_agents",
        description: "List every named agent currently configured (name + description) — use this to confirm a named agent exists before referencing it.",
        schema: z.object({}),
    }
);

// Keyed by `${deviceName}:${agentName}` — one instance per device per agent.
const namedAgents = new Map<string, ReturnType<typeof createAgent>>();

function getNamedAgent(deviceName: string, agentName: string): ReturnType<typeof createAgent> {
    if (!AGENT_NAME_RE.test(agentName)) {
        throw new Error(`Invalid agent name '${agentName}'.`);
    }

    const cacheKey = `${deviceName}:${agentName}`;
    const cached = namedAgents.get(cacheKey);
    if (cached) return cached;

    const header = readAgentHeader(agentName);
    if (!header) {
        throw new Error(`Agent '${agentName}' not found.`);
    }

    // allowed-tools restricts this agent to a named subset of sharedTools
    // (see agent.md's frontmatter); omitted means no restriction, matching
    // every named agent's behavior before this field existed.
    const tools = header.allowedTools
        ? [...sharedTools, listAvailableAgentsTool].filter((t) => header.allowedTools!.includes(t.name))
        : sharedTools;

    // Layers this agent's own skills (agents/<name>/skills/*/SKILL.md, if
    // any) on top of the global ones in ./skills — further restricted to
    // allowed-skills if the agent declares it.
    const agentSkillsDir = path.join(AGENTS_DIR, agentName, "skills");
    const namedAgent = createAgent({
        model: model,
        tools,
        checkpointer: sharedCheckpointer,
        systemPrompt: new SystemMessage(header.content),
        middleware: [
            createSkillMiddleware("./skills", { extraDirs: [agentSkillsDir], allowedSkills: header.allowedSkills }),
            createMemoryMiddleware(`devices/${deviceName}/memory`),
            logModelCallMiddleware,
        ],
    });

    namedAgents.set(cacheKey, namedAgent);
    return namedAgent;
}

export async function callNamedAgent(
    deviceName: string,
    agentName: string,
    message: string,
    localThreadId: string
): Promise<string> {
    const namedAgent = getNamedAgent(deviceName, agentName);
    const result = await namedAgent.invoke(
        { messages: [new HumanMessage(message)] },
        {
            recursionLimit: 100,
            configurable: {
                // Namespaced by device and agent name so switching agents (or
                // talking to the default agent), or switching devices, never
                // cross-contaminates conversation memory.
                thread_id: `device:${deviceName}:agent:${agentName}:${localThreadId}`,
            },
        }
    );
    const { messages: updatedMessages } = result;
    return extractText(updatedMessages[updatedMessages.length - 1].content);
}

// Wipes every conversation thread this chat has, across the default agent
// and every named agent, for this device only — so the next message starts
// from a clean slate. localChatId must be the same value used to key
// threads elsewhere (chatId in bot.ts) — see callNamedAgent's thread_id
// above and agent.ts's callAgent for the corresponding default-agent thread.
export async function clearSession(deviceName: string, localChatId: string): Promise<void> {
    await sharedCheckpointer.deleteThread(`device:${deviceName}:${localChatId}`);
    for (const agentName of listAvailableAgents()) {
        await sharedCheckpointer.deleteThread(`device:${deviceName}:agent:${agentName}:${localChatId}`);
    }
}
