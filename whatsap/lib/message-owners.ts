// lib/message-owners.ts
//
// Remembers which named agent wrote each message the bot sent, so a WhatsApp
// reply to that message can go back to the same agent. Without it a reply to the
// daily story prompt (written by the story-coach for a scheduled task) reaches
// the default agent, which has never seen that prompt and must guess who it was
// for — a small local model often does not. The bot already knows the author,
// so it is recorded instead of inferred.
//
// A reply carries the id of the message it quotes (rawData.quotedStanzaID, the
// short id that matches a sent Message's id.id). Persisted per device because
// the reply can come the next day, after a restart.

import fs from "node:fs";
import path from "node:path";

const MAX_ENTRIES = 500;

function fileFor(device: string, baseDir: string): string {
    return path.join(baseDir, device, "message-owners.json");
}

function load(device: string, baseDir: string): Record<string, string> {
    try {
        const parsed = JSON.parse(fs.readFileSync(fileFor(device, baseDir), "utf-8"));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function recordMessageOwner(device: string, shortId: string, agentName: string, baseDir = "devices"): void {
    const owners = load(device, baseDir);
    delete owners[shortId];
    owners[shortId] = agentName; // insertion order = age
    const keys = Object.keys(owners);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete owners[k];
    fs.mkdirSync(path.dirname(fileFor(device, baseDir)), { recursive: true });
    fs.writeFileSync(fileFor(device, baseDir), JSON.stringify(owners));
}

export function lookupMessageOwner(device: string, shortId: string, baseDir = "devices"): string | undefined {
    return load(device, baseDir)[shortId];
}

/** The agent that wrote the message `rawData` (an incoming reply) quotes, if the bot recorded one. */
export function ownerOfQuoted(device: string, rawData: any, baseDir = "devices"): string | undefined {
    const id = rawData?.quotedStanzaID;
    return typeof id === "string" && id ? lookupMessageOwner(device, id, baseDir) : undefined;
}

/** Short message id (the part a reply's quotedStanzaID carries) of a sent Message. */
export function shortIdOf(sent: any): string | undefined {
    const id = sent?.id;
    if (typeof id?.id === "string" && id.id) return id.id;
    const serialized: unknown = typeof id === "string" ? id : id?._serialized;
    // "<fromMe>_<chat>_<SHORTID>[_<participant>|_out]"
    return typeof serialized === "string" ? serialized.split("_")[2] || undefined : undefined;
}
