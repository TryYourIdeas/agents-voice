// lib/quoted-text.ts
//
// The text of the message a WhatsApp reply points at. Without it, "@ai make an
// audio of this" (sent as a reply to a summary or story) reaches the agent with
// no "this", and it asks the user to paste the text. The quoted message's own
// snapshot is embedded in message.rawData.quotedMsg (see message-media.ts for
// why message.getQuotedMessage() isn't used).

const TEXT_TYPES = new Set(["chat", "extended_text", "text"]);
const MEDIA_TYPES = new Set(["image", "video", "document", "sticker"]);

export function quotedMessageText(rawData: any): string | undefined {
    const quoted = rawData?.quotedMsg;
    if (!quoted) return undefined;
    // For media, `body` is thumbnail data; the text is the caption. Audio is
    // transcribed by resolveIncomingMedia instead.
    const raw = TEXT_TYPES.has(quoted.type) ? quoted.body : MEDIA_TYPES.has(quoted.type) ? quoted.caption : undefined;
    const text = typeof raw === "string" ? raw.trim() : "";
    return text || undefined;
}

export function withQuotedText(request: string, quotedText: string | undefined): string {
    if (!quotedText) return request;
    return `${request}\n\n[The user is replying to this earlier message:]\n${quotedText}`;
}
