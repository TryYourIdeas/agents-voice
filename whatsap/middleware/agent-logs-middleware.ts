import { createMiddleware } from "langchain";
import { logEvent, contentToText } from "../lib/agent-logs.ts";

// Records every model response and tool execution of an agent run into the
// SQLite agent log (lib/agent-logs.ts). Attached to the default agent and every
// named agent, so sub-agent activity is captured too. Purely observational:
// results are passed through untouched and logging errors never propagate.
export const agentLogsMiddleware = createMiddleware({
    name: "agentLogsMiddleware",
    wrapModelCall: async (request, handler) => {
        const started = Date.now();
        try {
            const response: any = await handler(request);
            const blocks = Array.isArray(response?.content) ? response.content : [];
            const thinking = blocks.filter((b: any) => b?.type === "thinking").map((b: any) => b.thinking ?? "").join("\n");
            logEvent({
                kind: "model",
                name: (request as any).model?.model ?? (request as any).model?.modelName,
                content: contentToText(response?.content),
                data: {
                    tool_calls: (response?.tool_calls ?? []).map((c: any) => ({ id: c.id, name: c.name, args: c.args })),
                    thinking: thinking || undefined,
                    usage: response?.usage_metadata,
                    stop_reason: response?.response_metadata?.stop_reason,
                },
                durationMs: Date.now() - started,
            });
            return response;
        } catch (e: any) {
            logEvent({ kind: "model", content: null, data: { error: String(e?.message ?? e) }, status: "error", durationMs: Date.now() - started });
            throw e;
        }
    },
    wrapToolCall: async (request, handler) => {
        const started = Date.now();
        const { name, args, id } = request.toolCall;
        try {
            const result: any = await handler(request);
            logEvent({
                kind: "tool",
                name,
                toolCallId: id,
                input: args,
                content: contentToText(result?.content ?? result),
                status: result?.status === "error" ? "error" : "ok",
                durationMs: Date.now() - started,
            });
            return result;
        } catch (e: any) {
            logEvent({ kind: "tool", name, toolCallId: id, input: args, content: String(e?.message ?? e), status: "error", durationMs: Date.now() - started });
            throw e;
        }
    },
});
