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
import { beginBotSend } from "./own-messages.ts";
import { diagnoseMediaPrep, synthesizeVoiceNote, voiceReplyEnabled } from "./voice-reply.ts";

const { MessageMedia } = whatsapp;

const DIAGRAM_MARKER_RE = /\[\[DIAGRAM:([^\]]+)\]\]/g;

// WhatsApp Web's media prep is picky about audio (an undefined filehash surfaces
// as "Data passed to getter must include an id property"), so walk from the most
// faithful voice note down to a plain audio attachment before giving up and
// letting the caller send text.
const VOICE_VARIANTS = [
    { label: "voice note (ogg/opus)", mimetype: undefined as string | undefined, voice: true },
    { label: "voice note (audio/ogg)", mimetype: "audio/ogg", voice: true },
    { label: "audio attachment", mimetype: "audio/ogg", voice: false },
];

export async function sendVoiceReply(client: any, chatId: string, text: string, onSent?: (sent: unknown) => void): Promise<boolean> {
    let note: { data: string; mimetype: string };
    try {
        note = await synthesizeVoiceNote(text);
    } catch (err) {
        console.error("[debug] voice reply synthesis failed, falling back to text:", err);
        return false;
    }
    for (const variant of VOICE_VARIANTS) {
        // Registered so bot.ts can recognise this voice note when it echoes back
        // through message_create and not feed it to the agent again.
        const sendDone = beginBotSend(chatId);
        try {
            const media = new MessageMedia(variant.mimetype ?? note.mimetype, note.data, "voice.ogg");
            const sent = await client.sendMessage(chatId, media, variant.voice ? { sendAudioAsVoice: true } : undefined);
            sendDone(sent);
            onSent?.(sent);
            return true;
        } catch (err) {
            sendDone();
            console.error(`[debug] voice reply as ${variant.label} failed: ${(err as Error)?.message?.split("\n")[0]}`);
        }
    }
    console.error("[debug] all voice reply variants failed, falling back to text");
    try {
        console.error("[debug] voice media prep diagnosis:", JSON.stringify(await diagnoseMediaPrep(client, note)));
    } catch (err) {
        console.error("[debug] voice media prep diagnosis failed:", (err as Error)?.message);
    }
    return false;
}

// `onSent` is called with each WhatsApp Message the bot actually sends, so callers
// can record who wrote it (lib/message-owners.ts).
export async function sendAgentResponse(
    client: any,
    chatId: string,
    response: string,
    opts: { voice?: boolean; onSent?: (sent: unknown) => void } = {},
): Promise<void> {
    if (opts.voice && voiceReplyEnabled() && (await sendVoiceReply(client, chatId, response, opts.onSent))) return;

    const diagramPaths = [...response.matchAll(DIAGRAM_MARKER_RE)].map((m) => m[1]);
    const text = response.replace(DIAGRAM_MARKER_RE, "").replace(/\n{3,}/g, "\n\n").trim();

    if (diagramPaths.length === 0) {
        const sent = await client.sendMessage(chatId, text);
        opts.onSent?.(sent);
        return;
    }

    for (const [index, diagramPath] of diagramPaths.entries()) {
        try {
            const media = MessageMedia.fromFilePath(diagramPath);
            const sent = await client.sendMessage(chatId, media, index === 0 && text ? { caption: text } : undefined);
            opts.onSent?.(sent);
        } catch (err) {
            console.error(`[debug] failed to send diagram '${diagramPath}':`, err);
        }
    }

    if (text && diagramPaths.length > 1) {
        const sent = await client.sendMessage(chatId, text);
        opts.onSent?.(sent);
    }
}
