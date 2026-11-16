import { describe, it, expect, vi } from "vitest";
import { yahooCredentials, truncateBody, replySubject, buildReferences, prepareEmail, deliverEmail, pickSentFolder, MAX_BODY_CHARS } from "./yahoo-mail.ts";

describe("yahooCredentials", () => {
    it("reads and strips spaces from the app password", () => {
        expect(yahooCredentials({ YAHOO_EMAIL: " me@yahoo.com ", YAHOO_APP_PASSWORD: "abcd efgh ijkl mnop" } as any)).toEqual({
            user: "me@yahoo.com",
            pass: "abcdefghijklmnop",
        });
    });
    it("throws a helpful error when unset", () => {
        expect(() => yahooCredentials({} as any)).toThrow(/YAHOO_APP_PASSWORD/);
    });
});

describe("helpers", () => {
    it("truncates long bodies", () => {
        const r = truncateBody("x".repeat(MAX_BODY_CHARS + 50));
        expect(r.truncated).toBe(true);
        expect(r.body).toHaveLength(MAX_BODY_CHARS);
        expect(truncateBody("hi\r\n\r\n\r\n\r\nthere")).toEqual({ body: "hi\n\nthere", truncated: false });
    });
    it("prefixes Re: once", () => {
        expect(replySubject("Hello")).toBe("Re: Hello");
        expect(replySubject("RE: Hello")).toBe("RE: Hello");
    });
    it("appends the message id to references without duplicating", () => {
        expect(buildReferences("<a> <b>", "<c>")).toEqual(["<a>", "<b>", "<c>"]);
        expect(buildReferences(["<a>"], "<a>")).toEqual(["<a>"]);
        expect(buildReferences(undefined, undefined)).toEqual([]);
    });
});

describe("prepareEmail (new message)", () => {
    it("resolves a new email without any network", async () => {
        const r = await prepareEmail({ to: "a@b.com", subject: "S", body: "B" });
        expect(r).toMatchObject({ to: "a@b.com", subject: "S", text: "B", isReply: false });
    });
    it("requires a recipient and subject", async () => {
        await expect(prepareEmail({ subject: "S", body: "B" })).rejects.toThrow(/Recipient/);
        await expect(prepareEmail({ to: "a@b.com", body: "B" })).rejects.toThrow(/Subject/);
    });
});

describe("deliverEmail", () => {
    const creds = { user: "me@yahoo.com", pass: "p" };
    const email = { to: "a@b.com", subject: "S", text: "B", isReply: false };
    it("sends then files a copy in Sent", async () => {
        const sendMail = vi.fn(async () => ({ messageId: "<id1>" }));
        const appendSent = vi.fn(async () => {});
        const r = await deliverEmail(email, { creds, transport: { sendMail } as any, appendSent });
        expect(r).toEqual({ messageId: "<id1>", savedToSent: true });
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "me@yahoo.com", to: "a@b.com", subject: "S", text: "B" }));
        const raw = appendSent.mock.calls[0][0] as Buffer;
        expect(raw.toString()).toContain("Message-ID: <id1>");
        expect(raw.toString()).toContain("Subject: S");
    });
    it("still reports success when saving to Sent fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const sendMail = vi.fn(async () => ({ messageId: "<id2>" }));
        const r = await deliverEmail(email, { creds, transport: { sendMail } as any, appendSent: async () => { throw new Error("boom"); } });
        expect(r).toEqual({ messageId: "<id2>", savedToSent: false, sentFolderError: "boom" });
    });
    it("propagates SMTP failures and does not touch Sent", async () => {
        const appendSent = vi.fn();
        await expect(deliverEmail(email, { creds, transport: { sendMail: async () => { throw new Error("535 auth"); } } as any, appendSent })).rejects.toThrow(/535/);
        expect(appendSent).not.toHaveBeenCalled();
    });
});

describe("pickSentFolder", () => {
    it("prefers the \\Sent special-use folder", () => {
        expect(pickSentFolder([{ path: "Inbox" }, { path: "Sent Items", specialUse: "\\Sent" }])).toBe("Sent Items");
        expect(pickSentFolder([{ path: "Inbox" }])).toBe("Sent");
    });
});
