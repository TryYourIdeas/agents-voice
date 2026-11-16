import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

// Yahoo Mail over IMAP (read) + SMTP (send), authenticated with an App Password
// (Yahoo account > Security > Generate app password). The normal account
// password does not work for third-party clients.
// Servers: https://help.yahoo.com/kb/SLN3697.html

export const YAHOO_IMAP = { host: "imap.mail.yahoo.com", port: 993, secure: true };
export const YAHOO_SMTP = { host: "smtp.mail.yahoo.com", port: 465, secure: true };

export const MAX_BODY_CHARS = 4000;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 25;

export interface YahooCredentials {
    user: string;
    pass: string;
}

export function yahooCredentials(env: NodeJS.ProcessEnv = process.env): YahooCredentials {
    const user = env.YAHOO_EMAIL?.trim();
    const pass = env.YAHOO_APP_PASSWORD?.replace(/\s+/g, "");
    if (!user || !pass) {
        throw new Error("Yahoo mail is not configured: set YAHOO_EMAIL and YAHOO_APP_PASSWORD (an app password, not the account password) in .env");
    }
    return { user, pass };
}

export interface EmailSummary {
    uid: number;
    messageId?: string;
    from: string;
    to: string;
    subject: string;
    date?: string;
    body: string;
    truncated: boolean;
    unread: boolean;
}

export function truncateBody(text: string, max = MAX_BODY_CHARS): { body: string; truncated: boolean } {
    const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return clean.length > max ? { body: clean.slice(0, max), truncated: true } : { body: clean, truncated: false };
}

export function replySubject(subject: string | undefined): string {
    const s = (subject ?? "").trim();
    return /^re:/i.test(s) ? s : `Re: ${s}`.trim();
}

export function buildReferences(references: string | string[] | undefined, messageId: string | undefined): string[] {
    const refs = Array.isArray(references) ? references : references ? references.split(/\s+/).filter(Boolean) : [];
    return messageId && !refs.includes(messageId) ? [...refs, messageId] : refs;
}

function quote(text: string): string {
    return text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
}

async function withImap<T>(creds: YahooCredentials, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
    const client = new ImapFlow({ ...YAHOO_IMAP, auth: creds, logger: false });
    // ImapFlow emits 'error' on socket problems; without a listener it crashes the process.
    client.on("error", (e) => console.error("[yahoo-mail] imap error:", e?.message ?? e));
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.logout().catch(() => {});
    }
}

export async function fetchNewEmails(
    opts: { limit?: number; markAsRead?: boolean; folder?: string; creds?: YahooCredentials } = {}
): Promise<EmailSummary[]> {
    const creds = opts.creds ?? yahooCredentials();
    const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    return withImap(creds, async (client) => {
        const lock = await client.getMailboxLock(opts.folder ?? "INBOX");
        try {
            const uids = ((await client.search({ seen: false }, { uid: true })) || []) as number[];
            // newest last in IMAP order; take the newest `limit`
            const wanted = uids.slice(-limit);
            const out: EmailSummary[] = [];
            for (const uid of wanted) {
                // `source` fetch with BODY.PEEK semantics: does not set \Seen
                const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
                if (!msg || !msg.source) continue;
                const parsed = await simpleParser(msg.source);
                const { body, truncated } = truncateBody(parsed.text ?? "");
                out.push({
                    uid,
                    messageId: parsed.messageId,
                    from: parsed.from?.text ?? "",
                    to: Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : (parsed.to?.text ?? ""),
                    subject: parsed.subject ?? "(no subject)",
                    date: parsed.date?.toISOString(),
                    body,
                    truncated,
                    unread: true,
                });
            }
            if (opts.markAsRead && wanted.length) {
                await client.messageFlagsAdd(wanted, ["\\Seen"], { uid: true });
            }
            return out.reverse(); // newest first
        } finally {
            lock.release();
        }
    });
}

export interface DraftInput {
    to?: string;
    cc?: string;
    subject?: string;
    body: string;
    /** UID (from yahoo_get_new_emails) of the INBOX message being replied to. */
    replyToUid?: number;
    creds?: YahooCredentials;
}

/** A fully resolved outgoing message: what the user confirms is exactly what is sent. */
export interface PreparedEmail {
    to: string;
    cc?: string;
    subject: string;
    text: string;
    inReplyTo?: string;
    references?: string[];
    isReply: boolean;
}

/** Resolves recipient/subject/threading/quote (fetching the original for replies). Sends nothing. */
export async function prepareEmail(input: DraftInput): Promise<PreparedEmail> {
    let { to, subject, body: text } = input;
    let inReplyTo: string | undefined;
    let references: string[] | undefined;

    if (input.replyToUid !== undefined) {
        const creds = input.creds ?? yahooCredentials();
        const original = await withImap(creds, async (client) => {
            const lock = await client.getMailboxLock("INBOX");
            try {
                const msg = await client.fetchOne(String(input.replyToUid), { source: true }, { uid: true });
                return msg && msg.source ? await simpleParser(msg.source) : null;
            } finally {
                lock.release();
            }
        });
        if (!original) throw new Error(`No message with UID ${input.replyToUid} in INBOX`);
        to = to ?? original.replyTo?.text ?? original.from?.text;
        subject = subject ?? replySubject(original.subject);
        inReplyTo = original.messageId;
        references = buildReferences(original.references, original.messageId);
        const when = original.date ? original.date.toUTCString() : "an earlier date";
        text = `${text}\n\nOn ${when}, ${original.from?.text ?? "the sender"} wrote:\n${quote((original.text ?? "").trim())}`;
    }

    if (!to) throw new Error("Recipient required: pass `to`, or `reply_to_uid` to reply to a received message");
    if (!subject) throw new Error("Subject required when sending a new email");
    return { to, cc: input.cc, subject, text, inReplyTo, references, isReply: input.replyToUid !== undefined };
}

/** Finds the Sent mailbox by its \\Sent special-use flag, falling back to the name "Sent". */
export function pickSentFolder(boxes: { path: string; specialUse?: string }[]): string {
    return boxes.find((b) => b.specialUse === "\\Sent")?.path ?? "Sent";
}

/** Copies the sent message into the IMAP Sent folder (Yahoo's SMTP does not do this itself). */
export async function appendToSent(raw: Buffer, creds: YahooCredentials): Promise<void> {
    await withImap(creds, async (client) => {
        const folder = pickSentFolder(await client.list());
        await client.append(folder, raw, ["\\Seen"]);
    });
}

export interface DeliverOptions {
    creds?: YahooCredentials;
    /** injectable for tests */
    transport?: Pick<nodemailer.Transporter, "sendMail">;
    appendSent?: (raw: Buffer, creds: YahooCredentials) => Promise<void>;
}

export interface DeliverResult {
    messageId: string;
    savedToSent: boolean;
    sentFolderError?: string;
}

export async function deliverEmail(p: PreparedEmail, opts: DeliverOptions = {}): Promise<DeliverResult> {
    const creds = opts.creds ?? yahooCredentials();
    const transport = opts.transport ?? nodemailer.createTransport({ ...YAHOO_SMTP, auth: creds });
    const message = {
        from: creds.user,
        to: p.to,
        cc: p.cc,
        subject: p.subject,
        text: p.text,
        inReplyTo: p.inReplyTo,
        references: p.references,
    };
    const info = await transport.sendMail(message);
    // The mail is already out; failing to file a copy must not look like a failed send.
    try {
        const raw = await composeRaw({ ...message, messageId: info.messageId });
        await (opts.appendSent ?? appendToSent)(raw, creds);
        return { messageId: info.messageId, savedToSent: true };
    } catch (e: any) {
        console.error("[yahoo-mail] sent, but could not save a copy to Sent:", e?.message ?? e);
        return { messageId: info.messageId, savedToSent: false, sentFolderError: e?.message ?? String(e) };
    }
}

async function composeRaw(message: nodemailer.SendMailOptions): Promise<Buffer> {
    const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
    const info: any = await t.sendMail(message);
    return info.message as Buffer;
}
