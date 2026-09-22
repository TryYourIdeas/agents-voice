import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChat } from "./useChat.ts";
import type { PageContext } from "./usePageContext.ts";

beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
            ok: true,
            json: async () => ({ reply: "agent reply" }),
        }))
    );
});

describe("useChat", () => {
    it("starts with an empty message list", () => {
        const { messages } = useChat("http://localhost:4100");
        expect(messages.value).toEqual([]);
    });

    it("appends the user message and the agent reply after sending", async () => {
        const { messages, sendMessage } = useChat("http://localhost:4100");
        await sendMessage("hello");
        expect(messages.value).toEqual([
            { role: "user", text: "hello" },
            { role: "agent", text: "agent reply" },
        ]);
    });

    it("sends the attached context and clears it after sending", async () => {
        const { sendMessage, pendingContext } = useChat("http://localhost:4100");
        const context: PageContext = { type: "selection", text: "some text", url: "https://example.com" };
        pendingContext.value = context;
        await sendMessage("review this");

        const [, options] = vi.mocked(fetch).mock.calls[0];
        const body = JSON.parse(options!.body as string);
        expect(body.context).toEqual(context);
        expect(pendingContext.value).toBeUndefined();
    });

    it("sets an error message when the request fails", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false, json: async () => ({ error: "boom" }) }))
        );
        const { messages, sendMessage } = useChat("http://localhost:4100");
        await sendMessage("hello");
        expect(messages.value).toEqual([
            { role: "user", text: "hello" },
            { role: "agent", text: "Error: could not reach the agent (boom)" },
        ]);
    });

    it("sets an error message when fetch itself throws (network/CORS failure)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            })
        );
        const { messages, sendMessage } = useChat("http://localhost:4100");
        await sendMessage("hello");
        expect(messages.value).toEqual([
            { role: "user", text: "hello" },
            { role: "agent", text: "Error: could not reach the agent (Failed to fetch)" },
        ]);
    });

    it("resets isSending after fetch throws", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            })
        );
        const { sendMessage, isSending } = useChat("http://localhost:4100");
        await sendMessage("hello");
        expect(isSending.value).toBe(false);
    });
});
