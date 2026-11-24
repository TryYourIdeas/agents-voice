import type { ChatAnthropic } from "@langchain/anthropic";
import type { StructuredTool } from "langchain";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { RunNamedAgent } from "../middleware/agent-delegation-middleware.ts";

/**
 * Overrides used by replays (lib/replay/run.ts): a different model, a tool list made of mock tools, a private
 * checkpointer. `replay` drops what would reach real side effects or the shared model: the default delegation to
 * named agents (they run with the real tools — a replay supplies `delegate` instead) and vision routing.
 */
export interface AgentOverrides {
    model?: ChatAnthropic;
    tools?: StructuredTool[];
    checkpointer?: BaseCheckpointSaver;
    replay?: boolean;
    /** replay only: runs a delegated named agent (see lib/replay/delegate.ts); without it the default agent cannot delegate */
    delegate?: RunNamedAgent;
}
