import { describe, it, expect } from "vitest";
import { resolveThreadChat } from "./thread-chat.ts";

describe("resolveThreadChat", () => {
    it("returns the device and raw chat id for a default-agent thread", () => {
        expect(resolveThreadChat("device:primary:189683@lid")).toEqual({ device: "primary", chatId: "189683@lid" });
    });

    it("strips the agent:<name>: namespace used by named agents", () => {
        expect(resolveThreadChat("device:primary:agent:story-coach:123@c.us")).toEqual({ device: "primary", chatId: "123@c.us" });
    });

    it("has no chat for scheduled-task threads", () => {
        expect(resolveThreadChat("device:primary:scheduled:daily:1700000000")).toEqual({ error: "scheduled" });
    });

    it("reports missing or malformed thread ids", () => {
        expect(resolveThreadChat(undefined)).toEqual({ error: "no-thread" });
        expect(resolveThreadChat("user-session-123")).toEqual({ error: "no-device" });
    });
});
