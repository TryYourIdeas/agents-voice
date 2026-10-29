import { describe, it, expect, vi, afterEach } from "vitest";
import { beginBotSend, isBotSend, resetOwnMessages } from "./own-messages.ts";

afterEach(() => {
    vi.useRealTimers();
    resetOwnMessages();
});

describe("own-messages", () => {
    it("treats a message arriving while a send is in flight as the bot's own", () => {
        const done = beginBotSend("chat");
        // message_create can fire before client.sendMessage() resolves, so no id is known yet
        expect(isBotSend("chat", "true_chat_AAA_out")).toBe(true);
        done();
    });

    it("recognises the sent message by id after the send resolves", () => {
        vi.useFakeTimers();
        const done = beginBotSend("chat");
        done({ id: { fromMe: true, remote: "chat", id: "AAA", _serialized: "true_chat_AAA" } });
        vi.advanceTimersByTime(60_000); // grace window is over, only the id is left
        expect(isBotSend("chat", "true_chat_AAA")).toBe(true);
        expect(isBotSend("chat", "true_chat_BBB")).toBe(false);
    });

    it("does not flag a user's voice note once the grace window has passed", () => {
        vi.useFakeTimers();
        beginBotSend("chat")();
        vi.advanceTimersByTime(60_000);
        expect(isBotSend("chat", "true_chat_USER_in")).toBe(false);
    });

    it("scopes the in-flight window to the chat being sent to", () => {
        const done = beginBotSend("chat-a");
        expect(isBotSend("chat-b", "x")).toBe(false);
        done();
    });

    it("releases the in-flight marker when the send throws (done called without a message)", () => {
        vi.useFakeTimers();
        beginBotSend("chat")();
        vi.advanceTimersByTime(60_000);
        expect(isBotSend("chat", "x")).toBe(false);
    });
});
