// lib/replay/seed.ts
//
// Rebuilds the starting state of a replay sandbox from what the ORIGINAL run saw: the results of its
// file reads and mailbox reads, as stored in the `events` table. Pure function; never throws.

import type { SandboxEmail } from "./sandbox.ts";

export interface SeedEvent {
    kind: string;
    name: string | null;
    input: string | null;
    content: string | null;
    status: string | null;
}

function parse(s: string | null): any {
    if (!s) return undefined;
    try {
        return JSON.parse(s);
    } catch {
        return undefined;
    }
}

function safeRelative(p: unknown): string | undefined {
    if (typeof p !== "string" || !p.trim() || p.startsWith("/") || p.split(/[\\/]/).includes("..")) return undefined;
    return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function seedFromEvents(events: SeedEvent[]): { files: Map<string, string>; inbox: SandboxEmail[] } {
    const files = new Map<string, string>();
    const inbox = new Map<number, SandboxEmail>();
    for (const e of events) {
        if (e.kind !== "tool" || e.status === "error" || e.content == null) continue;
        if (e.name === "my_read_file") {
            const p = safeRelative(parse(e.input)?.file_path);
            if (p && !files.has(p)) files.set(p, e.content);
        } else if (e.name === "yahoo_get_new_emails") {
            const list = parse(e.content);
            if (!Array.isArray(list)) continue;
            for (const m of list) {
                if (typeof m?.uid !== "number" || inbox.has(m.uid)) continue;
                inbox.set(m.uid, { uid: m.uid, from: String(m.from ?? ""), to: String(m.to ?? ""), subject: String(m.subject ?? ""), ...(m.date ? { date: String(m.date) } : {}), body: String(m.body ?? "") });
            }
        }
    }
    return { files, inbox: [...inbox.values()] };
}
