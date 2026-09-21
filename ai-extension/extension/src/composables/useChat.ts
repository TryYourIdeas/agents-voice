import { ref } from "vue";
import type { PageContext } from "./usePageContext.ts";

export interface ChatMessage {
    role: "user" | "agent";
    text: string;
}

// One threadId per side-panel session — generated once, kept for the whole
// session so the server's MemorySaver checkpointer sees a continuous
// conversation (see ai-extension/server/agent.ts).
const threadId = crypto.randomUUID();

export function useChat(serverUrl: string) {
    const messages = ref<ChatMessage[]>([]);
    const pendingContext = ref<PageContext | undefined>(undefined);
    const isSending = ref(false);

    async function sendMessage(text: string) {
        messages.value.push({ role: "user", text });
        isSending.value = true;
        try {
            const res = await fetch(`${serverUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text, threadId, context: pendingContext.value }),
            });
            const data = await res.json();
            if (!res.ok) {
                messages.value.push({ role: "agent", text: `Error: could not reach the agent (${data.error})` });
                return;
            }
            messages.value.push({ role: "agent", text: data.reply });
        } catch (error) {
            // fetch() itself throwing (connection refused, CORS-blocked
            // preflight, DNS failure, ...) never produces a Response, so
            // this is the only place that kind of failure surfaces.
            const reason = error instanceof Error ? error.message : String(error);
            messages.value.push({ role: "agent", text: `Error: could not reach the agent (${reason})` });
        } finally {
            pendingContext.value = undefined;
            isSending.value = false;
        }
    }

    return { messages, sendMessage, pendingContext, isSending };
}
