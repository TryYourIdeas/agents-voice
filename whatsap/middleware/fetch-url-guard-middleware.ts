import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import { contentToText } from "../lib/agent-logs.ts";

// Enforces "only fetch URLs you actually saw": a fetch_url call is allowed only if its URL appears in the
// conversation as text the model did not write itself - the user's messages (or a scheduled task's prompt)
// or an earlier tool result (search results, a fetched page's links). URLs the model made up from memory
// (e.g. https://naftasolutions.com/pump-info) are rejected with an error the model can read, so it goes back
// to searching. This also blocks a fetch to an address smuggled in only through model output.
// Set FETCH_URL_GUARD=false to disable.

export function normalizeUrl(u: string): string {
    try {
        const url = new URL(u.trim());
        url.hash = "";
        return (url.protocol + "//" + url.host + url.pathname.replace(/\/+$/, "") + url.search).toLowerCase();
    } catch {
        return u.trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();
    }
}

const URL_RE = /https?:\/\/[^\s"'<>)\]}\\]+/gi;

export function urlSeenInMessages(url: string, messages: any[]): boolean {
    const wanted = normalizeUrl(url);
    for (const m of messages ?? []) {
        const type = typeof m?.getType === "function" ? m.getType() : m?.type;
        if (type !== "human" && type !== "tool") continue;
        const text = contentToText(m.content);
        for (const found of text.match(URL_RE) ?? []) {
            // trailing punctuation from prose ("see https://x.com/a.") shouldn't break the match
            if (normalizeUrl(found) === wanted || normalizeUrl(found.replace(/[.,;:!?]+$/, "")) === wanted) return true;
        }
    }
    return false;
}

export const fetchUrlGuardMiddleware = createMiddleware({
    name: "fetchUrlGuardMiddleware",
    wrapToolCall: async (request, handler) => {
        if (request.toolCall.name !== "fetch_url" || process.env.FETCH_URL_GUARD === "false") return handler(request);
        const url = String((request.toolCall.args as any)?.url ?? "");
        if (urlSeenInMessages(url, (request.state as any)?.messages ?? [])) return handler(request);
        return new ToolMessage({
            content:
                `Error: ${url} was not given by the user or found in any search result or fetched page, so it was not fetched. ` +
                "Do not guess URLs. Use web_search to find real ones, or ask the user for the link.",
            tool_call_id: request.toolCall.id ?? "",
            name: "fetch_url",
            status: "error",
        });
    },
});
