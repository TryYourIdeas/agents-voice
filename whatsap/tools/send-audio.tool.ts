import { tool } from "langchain";
import { z } from "zod";
import { getWhatsAppClient } from "../lib/whatsapp-client.ts";
import { resolveThreadChat } from "../lib/thread-chat.ts";
import { sendVoiceReply } from "../lib/send-agent-response.ts";

const DEBUG = ["1", "true"].includes((process.env.NUXT_ADD_DEBUG_LOGS || "").toLowerCase());

// On-demand text-to-speech: the agent calls this only when the user asks to
// hear something (a summary it just wrote, a story, ...). It is separate from
// VOICE_REPLY, which automatically voices the answer to every voice note.
export const sendAudioTool = tool(
    async ({ text }: { text: string }, config) => {
        if (!process.env.TTS_URL) {
            return "Audio is not configured on this deployment (TTS_URL is not set), so no audio can be generated. Offer the text instead.";
        }
        if (!text.trim()) return "There is nothing to say: the text is empty.";

        const resolved = resolveThreadChat(config?.configurable?.thread_id as string | undefined);
        if ("error" in resolved) {
            return resolved.error === "scheduled"
                ? "There is no current chat in this context (scheduled task run), so audio cannot be sent."
                : "Could not determine the current chat, so audio cannot be sent.";
        }

        const client = getWhatsAppClient(resolved.device);
        if (DEBUG) console.log(`[debug] send_audio: ${text.length} chars -> ${resolved.chatId}`);
        const sent = await sendVoiceReply(client, resolved.chatId, text);
        return sent
            ? `The audio (${text.length} characters) was generated and sent to the chat as a voice note. Do not repeat the text; just confirm briefly.`
            : "Could not generate or send the audio (see the server logs). Tell the user and offer the text instead.";
    },
    {
        name: "send_audio",
        description:
            "Convert text to speech and send it to the current chat as a WhatsApp voice note. Use ONLY when the " +
            "user explicitly asks for audio/voice (e.g. 'read it to me', 'send that as audio', 'make an audio of the " +
            "story'). Never call it on your own initiative. Pass the exact text to be spoken — typically the " +
            "summary, story or other text already produced earlier in this conversation, copied in full, not " +
            "paraphrased or shortened. Plain prose is read best; markdown is stripped automatically.",
        schema: z.object({
            text: z.string().describe("The full text to be read aloud"),
        }),
    }
);
