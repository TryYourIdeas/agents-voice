// lib/replay/run.ts
//
// Re-runs a logged turn's first user message with a different model, in a sandbox. The replay agent gets
// mock tools only (tools/replay), so nothing real can happen. The run is logged as a normal turn that
// points at the original (replay_of) and the final sandbox state is stored for the UI.

import { openLogsDb, loggedTurn, currentTurnId } from "../agent-logs.ts";
import { getModelConfig, effectiveApiKey, type ModelConfig } from "../model-configs.ts";
import { Sandbox } from "./sandbox.ts";
import { seedFromEvents, type SeedEvent } from "./seed.ts";

export class ReplayError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

export interface ReplayContext {
    agent: any;
    message: string;
    device: string;
    threadId: string;
    sandbox: Sandbox;
    replayTurnId: number;
}

export interface ReplayDeps {
    getConfig?: (id: number) => ModelConfig | undefined;
    buildAgent?: (o: { agentName: string; device: string; config: ModelConfig; sandbox: Sandbox }) => Promise<any>;
    invoke?: (ctx: ReplayContext) => Promise<string>;
}

const DEBUG = Boolean(process.env.NUXT_ADD_DEBUG_LOGS) || Boolean(process.env.DEBUG_REPLAY);

async function defaultBuildAgent({ agentName, device, config, sandbox }: Parameters<NonNullable<ReplayDeps["buildAgent"]>>[0]) {
    // Loaded lazily: agent.ts pulls in the whole agent stack (prompts, tools, skills).
    const [{ ChatAnthropic }, { MemorySaver }, agent, named, { fetchUrlTool }, { getCurrentDatetimeTool }, { createReplayTools }, { createReplayWebSearch }] = await Promise.all([
        import("@langchain/anthropic"),
        import("@langchain/langgraph"),
        import("../../agent.ts"),
        import("../../named-agents.ts"),
        import("../../tools/fetch-url.tool.ts"),
        import("../../tools/get-current-datetime.tool.ts"),
        import("../../tools/replay/index.ts"),
        import("../../tools/replay/web-search.ts"),
    ]);
    const model = new ChatAnthropic({
        model: config.model,
        anthropicApiUrl: config.baseUrl,
        apiKey: effectiveApiKey(config.apiKey),
        temperature: 0,
        maxRetries: 2,
        maxTokens: process.env.MAX_TOKENS ? Number(process.env.MAX_TOKENS) : undefined,
        streaming: true,
    });
    const tools = createReplayTools(sandbox, { webSearch: createReplayWebSearch(sandbox) as any, fetchUrl: fetchUrlTool as any, getCurrentDatetime: getCurrentDatetimeTool as any });
    const o = { model, tools, checkpointer: new MemorySaver(), replay: true };
    return agentName === "default" ? agent.buildDefaultAgent(device, o) : named.buildNamedAgent(device, agentName, o);
}

async function defaultInvoke(ctx: ReplayContext): Promise<string> {
    const [{ HumanMessage }, util] = await Promise.all([import("@langchain/core/messages"), import("../../util.ts")]);
    try {
        const result = await ctx.agent.invoke(
            { messages: [new HumanMessage(ctx.message)] },
            { recursionLimit: util.agentRecursionLimit(), configurable: { thread_id: ctx.threadId } }
        );
        return util.extractText(result.messages[result.messages.length - 1].content);
    } catch (err) {
        if (!util.isRecursionLimitError(err)) throw err;
        return util.RECURSION_LIMIT_REPLY;
    }
}

function treeEvents(originalId: number): SeedEvent[] {
    const d = openLogsDb()!;
    return d
        .prepare(
            `WITH RECURSIVE tree(id) AS (SELECT ? UNION ALL SELECT c.id FROM turns c JOIN tree ON c.parent_turn_id = tree.id)
             SELECT kind, name, input, content, status FROM events WHERE turn_id IN (SELECT id FROM tree) ORDER BY id`
        )
        .all(originalId) as unknown as SeedEvent[];
}

/**
 * Starts a replay. Resolves as soon as the replay turn exists (so the caller can hand its id to the UI);
 * `done` settles when the run has finished (it rejects if the run failed — the turn row already says so).
 */
export async function startReplay(
    args: { originalTurnId: number; modelConfigId: number },
    deps: ReplayDeps = {}
): Promise<{ replayTurnId: number; done: Promise<void> }> {
    const d = openLogsDb();
    if (!d) throw new ReplayError("Agent logging is disabled or the log database is unavailable.", 503);
    const original = d.prepare("SELECT id, device, agent, user_message FROM turns WHERE id = ?").get(args.originalTurnId) as any;
    if (!original) throw new ReplayError(`Turn ${args.originalTurnId} not found.`, 404);
    const config = (deps.getConfig ?? ((id: number) => getModelConfig(id)))(args.modelConfigId);
    if (!config) throw new ReplayError(`Model configuration ${args.modelConfigId} not found.`, 404);
    if (!original.device) throw new ReplayError(`Turn ${original.id} has no device, so it cannot be replayed.`, 400);
    if (!original.user_message) throw new ReplayError(`Turn ${original.id} has no user message to replay.`, 400);

    const sandbox = new Sandbox();
    const seeded = seedFromEvents(treeEvents(original.id));
    for (const [p, c] of seeded.files) {
        sandbox.files.set(p, c);
        sandbox.seededPaths.add(p);
    }
    sandbox.inbox.push(...seeded.inbox);

    const buildAgent = deps.buildAgent ?? defaultBuildAgent;
    const invoke = deps.invoke ?? defaultInvoke;
    const device: string = original.device;
    console.log(`[replay] turn ${original.id} (${original.agent}) with model config '${config.name}' (${config.model}); seeded ${sandbox.files.size} files, ${sandbox.inbox.length} emails`);

    let resolveId!: (id: number | undefined) => void;
    const idPromise = new Promise<number | undefined>((r) => (resolveId = r));
    const done = loggedTurn(
        { device, chatId: `replay-of-${original.id}`, agent: original.agent, model: config.model, reasoningModel: config.model, replayOf: original.id, userMessage: original.user_message },
        async () => {
            const replayTurnId = currentTurnId();
            resolveId(replayTurnId);
            if (replayTurnId === undefined) throw new Error("could not create the replay turn");
            try {
                const agent = await buildAgent({ agentName: original.agent, device, config, sandbox });
                const reply = await invoke({ agent, message: original.user_message, device, threadId: `device:${device}:replay-${replayTurnId}`, sandbox, replayTurnId });
                sandbox.addMessage("reply", reply);
                if (DEBUG) console.log(`[replay] turn ${replayTurnId} finished: ${reply.length} chars`);
                return reply;
            } finally {
                if (replayTurnId !== undefined) sandbox.persist(replayTurnId);
            }
        }
    ).then(() => undefined);
    // the caller only awaits `done` in tests; make sure a failed run is never an unhandled rejection
    done.catch((e) => console.error(`[replay] run failed: ${String(e?.message ?? e).replace(config.apiKey || "\u0000", "***")}`));

    const replayTurnId = await idPromise;
    if (replayTurnId === undefined) throw new ReplayError("Could not create the replay turn.", 500);
    return { replayTurnId, done };
}
