// lib/message-trace.ts
//
// Diagnostics for agent loops: logs the *type* of every message in the
// conversation on each model call (Human/AI/Tool, content-block types,
// tool-call names/ids, tool_call_id, status). A loop that adds two messages per
// iteration (AIMessage with a tool call + ToolMessage) should show here whether
// the ToolMessage is the error/empty/unmatched kind the model keeps retrying.
// Enabled by NUXT_ADD_DEBUG_LOGS.

import { createMiddleware } from "langchain";

export const traceEnabled = (): boolean => ["1", "true"].includes((process.env.NUXT_ADD_DEBUG_LOGS || "").toLowerCase());

function blockTypes(content: unknown): string {
    if (typeof content === "string") return `text(${content.length})`;
    if (!Array.isArray(content)) return typeof content;
    return content
        .map((b: any) => {
            const t = b?.type ?? typeof b;
            if (t === "text") return `text(${String(b.text ?? "").length})`;
            if (t === "tool_use") return `tool_use:${b.name ?? "?"}`;
            if (t === "image" || t === "image_url") return t;
            return t;
        })
        .join("+");
}

export function describeMessage(m: any, index: number): string {
    const kind = typeof m?.getType === "function" ? m.getType() : m?.constructor?.name ?? typeof m;
    const parts = [`#${index} ${kind}`, `content=${blockTypes(m?.content)}`];
    if (Array.isArray(m?.tool_calls) && m.tool_calls.length > 0) {
        parts.push(`tool_calls=[${m.tool_calls.map((c: any) => `${c.name}:${c.id}:args=${JSON.stringify(c.args ?? {}).slice(0, 80)}`).join(", ")}]`);
    }
    if (Array.isArray(m?.invalid_tool_calls) && m.invalid_tool_calls.length > 0) {
        parts.push(`INVALID_tool_calls=[${m.invalid_tool_calls.map((c: any) => `${c.name}:${c.error ?? "?"}`).join(", ")}]`);
    }
    if (m?.tool_call_id) parts.push(`tool_call_id=${m.tool_call_id}`);
    if (m?.status) parts.push(`status=${m.status}`);
    if (m?.response_metadata?.stop_reason) parts.push(`stop_reason=${m.response_metadata.stop_reason}`);
    return parts.join(" ");
}

export function describeMessages(messages: any[]): string[] {
    return messages.map(describeMessage);
}

export function createMessageTypeTraceMiddleware(opts: { prefix: string }) {
    const { prefix } = opts;
    return createMiddleware({
        name: "MessageTypeTrace",
        beforeModel: (state) => {
            if (!traceEnabled()) return;
            const tail = state.messages.slice(-6);
            const offset = state.messages.length - tail.length;
            console.log(`${prefix} [trace] ${state.messages.length} messages in; last ${tail.length}:\n  ` + describeMessages(tail).map((l, i) => l.replace(/^#(\d+)/, (_, n) => `#${Number(n) + offset}`)).join("\n  "));
        },
        afterModel: (state) => {
            if (!traceEnabled()) return;
            const last = state.messages[state.messages.length - 1];
            console.log(`${prefix} [trace] model returned: ${describeMessage(last, state.messages.length - 1)}`);
        },
    });
}
