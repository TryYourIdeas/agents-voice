import { createMiddleware } from "langchain";

// prefix identifies which agent's logs these are, since whatsap and
// ai-extension/server can share the same console (e.g. mixed stdout under
// docker compose). truncate caps the "model returned" line to that many
// characters; omit it to log the full content, uncapped.
export function createLogModelCallMiddleware(opts: { prefix: string; truncate?: number }) {
    const { prefix, truncate } = opts;
    return createMiddleware({
        name: "LoggingMiddleware",
        beforeModel: (state) => {
            console.log(`${prefix} calling model with ${state.messages.length} messages`);
        },
        afterModel: (state) => {
            const lastMessage = state.messages[state.messages.length - 1];
            const content = JSON.stringify(lastMessage.content);
            console.log(`${prefix} model returned: ${truncate ? content.slice(0, truncate) : content}`);
        },
    });
}
