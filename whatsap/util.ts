export function extractText(content: string | Array<{ type: string; text?: string }>): string {
    if (typeof content === "string") {
        return content;
    }

    // ChatAnthropic can return an array of content blocks (e.g. thinking + text)
    // instead of a plain string; only the text blocks are meant for the user.
    return content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("\n");
}

// Caps the agent's tool-call loop. Small local models (LFM3) can keep
// re-running the same web_search without ever answering; the default of 100
// then takes minutes to hit. Override with AGENT_RECURSION_LIMIT.
export function agentRecursionLimit(): number {
    const n = Number.parseInt(process.env.AGENT_RECURSION_LIMIT || '', 10);
    return Number.isFinite(n) && n > 0 ? n : 100;
}

export const RECURSION_LIMIT_REPLY =
    "Sorry, I got stuck looping on tool calls without reaching an answer. Please try rephrasing or asking something narrower.";

export function isRecursionLimitError(err: unknown): boolean {
    return (err as any)?.lc_error_code === 'GRAPH_RECURSION_LIMIT' || (err as Error)?.name === 'GraphRecursionError';
}
