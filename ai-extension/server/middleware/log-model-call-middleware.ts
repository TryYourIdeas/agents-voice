import { createMiddleware } from "langchain";

export const logModelCallMiddleware = createMiddleware({
    name: "LoggingMiddleware",
    beforeModel: (state) => {
        console.log(`[ai-extension] calling model with ${state.messages.length} messages`);
    },
    afterModel: (state) => {
        const lastMessage = state.messages[state.messages.length - 1];
        console.log(`[ai-extension] model returned: ${JSON.stringify(lastMessage.content).slice(0, 500)}`);
    },
});
