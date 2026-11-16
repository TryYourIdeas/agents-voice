import { describe, it, expect, beforeEach } from "vitest";
import { setPendingMail, getPendingMail, clearPendingMail, resetPendingMail, parseConfirmation, describeDraft, pendingKey, PENDING_TTL_MS } from "./pending-mail.ts";

const email = { to: "a@b.com", subject: "S", text: "Hello", isReply: false };

describe("pending mail store", () => {
    beforeEach(() => resetPendingMail());
    it("keeps one draft per chat, newest wins", () => {
        const k = pendingKey("primary", "chat1");
        setPendingMail(k, email);
        setPendingMail(k, { ...email, subject: "S2" });
        expect(getPendingMail(k)?.subject).toBe("S2");
        expect(getPendingMail(pendingKey("primary", "other"))).toBeUndefined();
    });
    it("expires after the TTL", () => {
        setPendingMail("k", email, 1000);
        expect(getPendingMail("k", 1000 + PENDING_TTL_MS)).toBeDefined();
        expect(getPendingMail("k", 1001 + PENDING_TTL_MS)).toBeUndefined();
    });
    it("clears", () => {
        setPendingMail("k", email);
        clearPendingMail("k");
        expect(getPendingMail("k")).toBeUndefined();
    });
});

describe("parseConfirmation", () => {
    it.each(["yes", "Yes!", " y ", "send", "@ai yes", "OK"])("%s -> yes", (t) => expect(parseConfirmation(t)).toBe("yes"));
    it.each(["no", "Cancel", "don't send", "@ai no"])("%s -> no", (t) => expect(parseConfirmation(t)).toBe("no"));
    it.each(["yes please change the subject", "send it to bob", "", "maybe"])("%s -> undefined", (t) => expect(parseConfirmation(t)).toBeUndefined());
});

describe("describeDraft", () => {
    it("states it is not sent and shows the fields", () => {
        const d = describeDraft({ ...email, cc: "c@d.com", isReply: true });
        expect(d).toMatch(/NOT sent yet/);
        expect(d).toContain("To: a@b.com");
        expect(d).toContain("Cc: c@d.com");
        expect(d).toContain("Subject: S");
    });
});
