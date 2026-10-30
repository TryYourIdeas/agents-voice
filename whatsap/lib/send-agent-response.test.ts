import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./voice-reply.ts", () => ({
    voiceReplyEnabled: () => true,
    synthesizeVoiceNote: vi.fn(async () => ({ data: "QUJD", mimetype: "audio/ogg; codecs=opus" })),
}));

import { sendAgentResponse } from "./send-agent-response.ts";
import { isBotSend, resetOwnMessages } from "./own-messages.ts";

describe("sendAgentResponse voice replies", () => {
    beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

    it("falls back to the next audio variant, then stops once one succeeds", async () => {
        const sendMessage = vi.fn()
            .mockRejectedValueOnce(new Error("Data passed to getter must include an id property"))
            .mockRejectedValueOnce(new Error("again"))
            .mockResolvedValueOnce(undefined);
        await sendAgentResponse({ sendMessage }, "chat", "hello", { voice: true });
        expect(sendMessage).toHaveBeenCalledTimes(3);
        expect(sendMessage.mock.calls.every(([, m]) => typeof m !== "string")).toBe(true);
    });

    it("sends text when every audio variant fails", async () => {
        const sendMessage = vi.fn(async (_c: string, m: unknown) => {
            if (typeof m !== "string") throw new Error("nope");
        });
        await sendAgentResponse({ sendMessage }, "chat", "hello", { voice: true });
        expect(sendMessage).toHaveBeenLastCalledWith("chat", "hello");
    });

    it("registers the sent voice note so the bot ignores its own echo", async () => {
        resetOwnMessages();
        const sent = { id: { fromMe: true, remote: "chat", id: "ZZZ", _serialized: "true_chat_ZZZ" } };
        await sendAgentResponse({ sendMessage: vi.fn(async () => sent) }, "chat", "hello", { voice: true });
        expect(isBotSend("chat", "true_chat_ZZZ")).toBe(true);
        resetOwnMessages();
    });

    it("reports every message it sends through onSent (text and voice)", async () => {
        const sent = { id: { id: "SHORT1" } };
        const onSent = vi.fn();
        await sendAgentResponse({ sendMessage: vi.fn(async () => sent) }, "chat", "hello", { onSent });
        expect(onSent).toHaveBeenCalledWith(sent);
        onSent.mockClear();
        await sendAgentResponse({ sendMessage: vi.fn(async () => sent) }, "chat", "hello", { voice: true, onSent });
        expect(onSent).toHaveBeenCalledTimes(1);
        resetOwnMessages();
    });
});
