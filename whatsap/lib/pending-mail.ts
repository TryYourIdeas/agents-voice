// lib/pending-mail.ts
//
// Human-in-the-loop gate for outgoing email. The mail agent can only *queue* a
// draft here (tools/yahoo-mail.tool.ts); the actual send happens from bot.ts
// when the human replies "yes" in the same WhatsApp chat. The confirmation is
// matched in code, never by the LLM, so text inside a received email (prompt
// injection) cannot trigger a send. In-memory only: pending drafts are lost on
// restart, which fails safe (nothing is sent).

import type { PreparedEmail } from "./yahoo-mail.ts";

export const PENDING_TTL_MS = 15 * 60_000;

interface Pending {
    email: PreparedEmail;
    createdAt: number;
}

const pending = new Map<string, Pending>();

export const pendingKey = (device: string, chatId: string) => `${device}:${chatId}`;

/** One draft per chat: a new draft replaces the previous one. */
export function setPendingMail(key: string, email: PreparedEmail, now = Date.now()): void {
    pending.set(key, { email, createdAt: now });
}

export function getPendingMail(key: string, now = Date.now()): PreparedEmail | undefined {
    const p = pending.get(key);
    if (!p) return undefined;
    if (now - p.createdAt > PENDING_TTL_MS) {
        pending.delete(key);
        return undefined;
    }
    return p.email;
}

export function clearPendingMail(key: string): void {
    pending.delete(key);
}

export function resetPendingMail(): void {
    pending.clear();
}

const YES_RE = /^(?:@ai\s+)?(?:yes|y|send|send it|confirm|confirmed|ok|okay)[.!]*$/i;
const NO_RE = /^(?:@ai\s+)?(?:no|n|cancel|discard|don'?t send|do not send|stop)[.!]*$/i;

export function parseConfirmation(body: string): "yes" | "no" | undefined {
    const t = body.trim();
    if (YES_RE.test(t)) return "yes";
    if (NO_RE.test(t)) return "no";
    return undefined;
}

export function describeDraft(e: PreparedEmail): string {
    return [
        `📧 Draft ${e.isReply ? "reply" : "email"} — NOT sent yet`,
        `To: ${e.to}`,
        ...(e.cc ? [`Cc: ${e.cc}`] : []),
        `Subject: ${e.subject}`,
        "",
        e.text,
        "",
        "Reply *yes* to send, *no* to discard (or tell me what to change).",
    ].join("\n");
}
