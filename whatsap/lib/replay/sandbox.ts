// lib/replay/sandbox.ts
//
// In-memory mock world of one replay: file system, mailbox and chat. Nothing here touches the real disk,
// IMAP or WhatsApp. persist() copies the final state into the logs DB so the UI can show it.

import path from "node:path";
import { openLogsDb } from "../agent-logs.ts";

export interface SandboxEmail {
    uid: number;
    from: string;
    to: string;
    subject: string;
    date?: string;
    body: string;
    inReplyToUid?: number;
}

export interface SandboxMessage {
    kind: "reply" | "audio";
    text: string;
    ts: string;
}

export class Sandbox {
    files = new Map<string, string>();
    /** paths that came from the original log (everything else was written by the replayed agent) */
    seededPaths = new Set<string>();
    /** directories created explicitly (files imply their parents) */
    dirs = new Set<string>();
    inbox: SandboxEmail[] = [];
    sent: SandboxEmail[] = [];
    messages: SandboxMessage[] = [];

    /** Canonical relative form of a tool-supplied path; throws if it is absolute or escapes the sandbox root. */
    normalizePath(p: string): string {
        if (typeof p !== "string" || !p.trim()) throw new Error("Path cannot be empty");
        if (p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:/.test(p)) throw new Error(`Path must be relative: ${p}`);
        const n = path.posix.normalize(p.replace(/\\/g, "/"));
        if (n === ".." || n.startsWith("../") || n.split("/").includes("..")) throw new Error(`Path escapes the sandbox: ${p}`);
        return n === "." ? "" : n.replace(/\/$/, "");
    }

    addMessage(kind: SandboxMessage["kind"], text: string): void {
        this.messages.push({ kind, text, ts: new Date().toISOString() });
    }

    /** Stores the state under the replay turn id. Never throws: logging must not break the agent. */
    persist(turnId: number): void {
        const d = openLogsDb();
        if (!d) return;
        try {
            const file = d.prepare("INSERT OR REPLACE INTO replay_files (turn_id, path, content, origin) VALUES (?, ?, ?, ?)");
            for (const [p, c] of this.files) file.run(turnId, p, c, this.seededPaths.has(p) ? "seeded" : "written");
            const mail = d.prepare(
                `INSERT OR REPLACE INTO replay_emails (turn_id, folder, uid, from_addr, to_addr, subject, date, body, in_reply_to_uid)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            for (const [folder, list] of [["inbox", this.inbox], ["sent", this.sent]] as const)
                for (const e of list) mail.run(turnId, folder, e.uid, e.from, e.to, e.subject, e.date ?? null, e.body, e.inReplyToUid ?? null);
            const msg = d.prepare("INSERT OR REPLACE INTO replay_messages (turn_id, seq, ts, kind, text) VALUES (?, ?, ?, ?, ?)");
            this.messages.forEach((m, i) => msg.run(turnId, i + 1, m.ts, m.kind, m.text));
        } catch (e: any) {
            console.warn(`[replay] could not persist sandbox for turn ${turnId}: ${e?.message ?? e}`);
        }
    }
}
