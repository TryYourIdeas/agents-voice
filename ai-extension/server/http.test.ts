import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("./agent.ts", () => ({
    callAgent: vi.fn(async (message: string) => `echo: ${message}`),
}));

import { createApp } from "./http.ts";
import { callAgent } from "./agent.ts";

const EXTENSION_ORIGIN = "chrome-extension://test-extension-id";

beforeEach(() => {
    vi.mocked(callAgent).mockClear();
});

describe("GET /health", () => {
    it("returns ok", async () => {
        const app = createApp({ extensionId: "test-extension-id", maxContextChars: 1000 });
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "ok" });
    });
});

describe("POST /api/chat", () => {
    it("rejects requests from a different origin", async () => {
        const app = createApp({ extensionId: "test-extension-id", maxContextChars: 1000 });
        const res = await request(app)
            .post("/api/chat")
            .set("Origin", "chrome-extension://some-other-id")
            .send({ message: "hi", threadId: "t1" });
        expect(res.status).toBe(403);
    });

    it("accepts requests from the configured extension origin and returns the agent's reply", async () => {
        const app = createApp({ extensionId: "test-extension-id", maxContextChars: 1000 });
        const res = await request(app)
            .post("/api/chat")
            .set("Origin", EXTENSION_ORIGIN)
            .send({ message: "hi", threadId: "t1" });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ reply: "echo: hi" });
    });

    it("prepends formatted context to the message sent to the agent", async () => {
        const app = createApp({ extensionId: "test-extension-id", maxContextChars: 1000 });
        await request(app)
            .post("/api/chat")
            .set("Origin", EXTENSION_ORIGIN)
            .send({
                message: "review this",
                threadId: "t1",
                context: { type: "selection", text: "some page text", url: "https://example.com" },
            });
        const [sentMessage] = vi.mocked(callAgent).mock.calls[0];
        expect(sentMessage).toContain("some page text");
        expect(sentMessage).toContain("review this");
    });

    it("returns 400 when message is missing", async () => {
        const app = createApp({ extensionId: "test-extension-id", maxContextChars: 1000 });
        const res = await request(app)
            .post("/api/chat")
            .set("Origin", EXTENSION_ORIGIN)
            .send({ threadId: "t1" });
        expect(res.status).toBe(400);
    });

    it("returns 400 when threadId is missing", async () => {
        const app = createApp({ extensionId: "test-extension-id", maxContextChars: 1000 });
        const res = await request(app)
            .post("/api/chat")
            .set("Origin", EXTENSION_ORIGIN)
            .send({ message: "hi" });
        expect(res.status).toBe(400);
    });

    it("returns a friendly message when the model backend is still loading (503)", async () => {
        vi.mocked(callAgent).mockRejectedValueOnce(Object.assign(new Error("Loading model"), { status: 503 }));
        const app = createApp({ extensionId: "test-extension-id", maxContextChars: 1000 });
        const res = await request(app)
            .post("/api/chat")
            .set("Origin", EXTENSION_ORIGIN)
            .send({ message: "hi", threadId: "t1" });
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/still starting up/i);
    });

    it("returns a friendly message when the 503 is nested under .cause (LangChain MiddlewareError)", async () => {
        const cause = Object.assign(new Error("Loading model"), { status: 503 });
        vi.mocked(callAgent).mockRejectedValueOnce(Object.assign(new Error("wrapped"), { cause }));
        const app = createApp({ extensionId: "test-extension-id", maxContextChars: 1000 });
        const res = await request(app)
            .post("/api/chat")
            .set("Origin", EXTENSION_ORIGIN)
            .send({ message: "hi", threadId: "t1" });
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/still starting up/i);
    });

    it("falls back to a generic message for other agent failures", async () => {
        vi.mocked(callAgent).mockRejectedValueOnce(new Error("boom"));
        const app = createApp({ extensionId: "test-extension-id", maxContextChars: 1000 });
        const res = await request(app)
            .post("/api/chat")
            .set("Origin", EXTENSION_ORIGIN)
            .send({ message: "hi", threadId: "t1" });
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Agent call failed" });
    });
});
