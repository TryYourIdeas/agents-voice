import { tool } from "langchain";
import { z } from "zod";
import { getWhatsAppClient } from "../lib/whatsapp-client.ts";
import { resolveThreadChat } from "../lib/thread-chat.ts";

export const getCurrentChatTool = tool(
    async (_input, config) => {
        const resolved = resolveThreadChat(config?.configurable?.thread_id as string | undefined);
        if ("error" in resolved) {
            if (resolved.error === "no-thread") return "Could not determine the current chat: no conversation context available.";
            if (resolved.error === "no-device") return "Could not determine the current chat: no device context available.";
            return "There is no 'current chat' in this context (this is a scheduled task run, not a live conversation) — the destination chat must already be fixed on the task itself.";
        }
        const { device, chatId } = resolved;

        const client = getWhatsAppClient(device);
        const name: string | undefined = await client.pupPage!.evaluate((id: string) => {
            // @ts-ignore - window.require is whatsapp-web.js's own webpack
            // module loader, injected into the page, not typed. The global
            // window.Store shim was dropped as of whatsapp-web.js@1.34.7 —
            // window.require('WAWebCollections')/('WAWebWidFactory') is the
            // modern equivalent, matching the library's own internal usage.
            const chat = window.require('WAWebCollections').Chat.get(window.require('WAWebWidFactory').createWid(id));
            if (!chat) return undefined;
            return chat.isGroup ? `${chat.formattedTitle || chat.name} (group)` : (chat.formattedTitle || chat.name);
        }, chatId);

        return name
            ? `The current chat/channel is: ${name}`
            : `Could not resolve a display name for the current chat (id: ${chatId}).`;
    },
    {
        name: "get_current_chat",
        description:
            "Get the name of the chat/channel/group this conversation is currently happening in. Use this " +
            "whenever the user refers to 'this chat', 'the current chat', 'current group', or 'current channel' " +
            "instead of asking them to name it. Returns an explanatory message instead of a name if there's no " +
            "current chat available in this context (e.g. during a scheduled task run, which has no live " +
            "conversation) — in that case, ask the user instead.",
        schema: z.object({}),
    }
);
