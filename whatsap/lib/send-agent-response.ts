// lib/send-agent-response.ts
//
// Delivers an agent's final reply to a WhatsApp chat, handling the
// [[DIAGRAM:<path>]] marker convention from tools/render-diagram.tool.ts
// (see that file for why the marker exists). Generalized to take a chatId
// instead of a whatsapp-web.js Message object — index.ts's live message
// handlers have a Message to reply to, but scheduler.ts firing a scheduled
// task does not, so both need to go through this same delivery path with
// only the destination chat in common.

import whatsapp from "whatsapp-web.js";

const { MessageMedia } = whatsapp;

const DIAGRAM_MARKER_RE = /\[\[DIAGRAM:([^\]]+)\]\]/g;

export async function sendAgentResponse(client: any, chatId: string, response: string): Promise<void> {
    const diagramPaths = [...response.matchAll(DIAGRAM_MARKER_RE)].map((m) => m[1]);
    const text = response.replace(DIAGRAM_MARKER_RE, "").replace(/\n{3,}/g, "\n\n").trim();

    if (diagramPaths.length === 0) {
        await client.sendMessage(chatId, text);
        return;
    }

    for (const [index, diagramPath] of diagramPaths.entries()) {
        try {
            const media = MessageMedia.fromFilePath(diagramPath);
            await client.sendMessage(chatId, media, index === 0 && text ? { caption: text } : undefined);
        } catch (err) {
            console.error(`[debug] failed to send diagram '${diagramPath}':`, err);
        }
    }

    if (text && diagramPaths.length > 1) {
        await client.sendMessage(chatId, text);
    }
}
