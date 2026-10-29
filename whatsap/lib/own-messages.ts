// lib/own-messages.ts
//
// Tells the bot's own outgoing messages apart from the user's. The bot is
// linked to the user's own WhatsApp account, so a voice reply it sends in the
// self-chat comes back through `message_create` as `fromMe=true, type=ptt`,
// exactly like a voice note the user records themselves. Without this the
// reply is transcribed, answered, voiced and sent again, forever.
//
// Two signals, because the event can fire before `client.sendMessage()` has
// resolved (no id known yet): a per-chat "send in flight" counter that is held
// for a short grace period after the send, and the ids of messages already sent.

import { messageIdOf } from "./message-media.ts";

const GRACE_MS = 15_000;
const MAX_IDS = 500;

const inFlight = new Map<string, number>();
const sentIds = new Set<string>();

function release(chatId: string): void {
    const n = (inFlight.get(chatId) ?? 1) - 1;
    if (n <= 0) inFlight.delete(chatId);
    else inFlight.set(chatId, n);
}

/** Call before sending to `chatId`; call the returned function when the send settles (with the sent Message, if any). */
export function beginBotSend(chatId: string): (sent?: unknown) => void {
    inFlight.set(chatId, (inFlight.get(chatId) ?? 0) + 1);
    return (sent?: unknown) => {
        const id = sent ? messageIdOf(sent) : undefined;
        if (id) {
            sentIds.add(id);
            if (sentIds.size > MAX_IDS) sentIds.delete(sentIds.values().next().value as string);
        }
        const timer = setTimeout(() => release(chatId), GRACE_MS);
        timer.unref?.();
    };
}

export function isBotSend(chatId: string, id?: string): boolean {
    return (inFlight.get(chatId) ?? 0) > 0 || (!!id && sentIds.has(id));
}

export function resetOwnMessages(): void {
    inFlight.clear();
    sentIds.clear();
}
