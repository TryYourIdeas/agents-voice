import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";

// Turns an error thrown by any tool into an error ToolMessage instead of aborting the whole turn.
// Before this, one failing tool call (e.g. `file diagrams/*.png` with `file` not installed, a 403, a DNS
// failure) ended the request with "Sorry, something went wrong processing that request" even though the
// model could have worked around it. Now the model reads the error and tries something else; the
// recursion limit and the dedupe/guard middleware still bound any retrying.
//
// Control-flow errors (LangGraph interrupts / parent commands, `is_bubble_up`) are re-thrown untouched.
// Attach it LAST in the middleware list so it is the innermost wrapper: the logger then records the
// error result and the guard middleware's own blocks still work.
export const toolErrorMiddleware = createMiddleware({
    name: "toolErrorMiddleware",
    wrapToolCall: async (request, handler) => {
        try {
            return await handler(request);
        } catch (e: any) {
            if (e?.is_bubble_up || e?.name === "GraphInterrupt") throw e;
            const { name, id } = request.toolCall;
            console.warn(`[tool-error] ${name} failed: ${e?.message ?? e}`);
            return new ToolMessage({
                content: `Error: ${name} failed: ${String(e?.message ?? e).trim().slice(0, 2000)}`,
                tool_call_id: id ?? "",
                name,
                status: "error",
            });
        }
    },
});
