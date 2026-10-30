import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/whatsapp-client.ts", () => ({ getWhatsAppClient: vi.fn(() => ({ id: "client" })) }));
vi.mock("../lib/send-agent-response.ts", () => ({ sendVoiceReply: vi.fn(async () => true) }));

import { sendAudioTool } from "./send-audio.tool.ts";
import { sendVoiceReply } from "../lib/send-agent-response.ts";
import { getWhatsAppClient } from "../lib/whatsapp-client.ts";

const config = { configurable: { thread_id: "device:primary:123@lid" } };

describe("send_audio tool", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "log").mockImplementation(() => {});
        process.env.TTS_URL = "http://tts:8010";
    });
    afterEach(() => {
        delete process.env.TTS_URL;
    });

    it("voices the text and sends it to the current chat", async () => {
        const result = await sendAudioTool.invoke({ text: "Once upon a time." }, config);
        expect(getWhatsAppClient).toHaveBeenCalledWith("primary");
        expect(sendVoiceReply).toHaveBeenCalledWith({ id: "client" }, "123@lid", "Once upon a time.");
        expect(result).toMatch(/audio.*sent/i);
    });

    it("sends to the chat of a named-agent thread", async () => {
        await sendAudioTool.invoke({ text: "hi" }, { configurable: { thread_id: "device:primary:agent:story-coach:9@c.us" } });
        expect(sendVoiceReply).toHaveBeenCalledWith(expect.anything(), "9@c.us", "hi");
    });

    it("explains when TTS is not configured, without calling the TTS path", async () => {
        delete process.env.TTS_URL;
        const result = await sendAudioTool.invoke({ text: "hi" }, config);
        expect(result).toMatch(/not configured/i);
        expect(sendVoiceReply).not.toHaveBeenCalled();
    });

    it("explains when there is no live chat (scheduled task)", async () => {
        const result = await sendAudioTool.invoke({ text: "hi" }, { configurable: { thread_id: "device:primary:scheduled:daily:1" } });
        expect(result).toMatch(/no current chat/i);
        expect(sendVoiceReply).not.toHaveBeenCalled();
    });

    it("refuses text with nothing to read aloud", async () => {
        const result = await sendAudioTool.invoke({ text: "   " }, config);
        expect(result).toMatch(/nothing to say/i);
        expect(sendVoiceReply).not.toHaveBeenCalled();
    });

    it("reports failure so the agent can fall back to text", async () => {
        vi.mocked(sendVoiceReply).mockResolvedValueOnce(false);
        const result = await sendAudioTool.invoke({ text: "hi" }, config);
        expect(result).toMatch(/could not/i);
    });
});
