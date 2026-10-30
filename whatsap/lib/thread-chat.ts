// lib/thread-chat.ts
//
// Recovers the device and WhatsApp chat id a conversation belongs to from a
// LangGraph thread id. Shared by tools that act on "the current chat"
// (get_current_chat, send_audio).
//
// Thread ids look like "device:<name>:<chatId>"; named agents add an
// "agent:<agentName>:" namespace before the chat id (see named-agents.ts's
// callNamedAgent). Scheduled-task ids ("scheduled:<taskName>:<timestamp>",
// see scheduler.ts) aren't a real chat id: there is no "current chat" in that
// context, only the task's own fixed destination chat.

import { parseDeviceThreadId } from "./devices.ts";

export type ThreadChat =
    | { device: string; chatId: string }
    | { error: "no-thread" | "no-device" | "scheduled" };

export function resolveThreadChat(threadId: string | undefined): ThreadChat {
    if (!threadId) return { error: "no-thread" };
    const parsed = parseDeviceThreadId(threadId);
    if (!parsed) return { error: "no-device" };
    if (parsed.rest.startsWith("scheduled:")) return { error: "scheduled" };
    const agentMatch = parsed.rest.match(/^agent:[^:]+:(.+)$/);
    return { device: parsed.device, chatId: agentMatch ? agentMatch[1] : parsed.rest };
}
