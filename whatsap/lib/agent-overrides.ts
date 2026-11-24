import type { ChatAnthropic } from "@langchain/anthropic";
import type { StructuredTool } from "langchain";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

/**
 * Overrides used by replays (lib/replay/run.ts): a different model, a tool list made of mock tools, a private
 * checkpointer. `replay` drops what would reach real side effects or the shared model: delegation to named
 * agents (they run with the real tools) and vision routing (it targets the real vision model).
 */
export interface AgentOverrides {
    model?: ChatAnthropic;
    tools?: StructuredTool[];
    checkpointer?: BaseCheckpointSaver;
    replay?: boolean;
}
