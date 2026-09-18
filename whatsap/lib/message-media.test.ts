import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveIncomingMedia } from "./message-media.ts";

function makeClient(evaluateImpl: (fn: any, raw: any) => any) {
    return { pupPage: { evaluate: vi.fn(evaluateImpl) } };
}

function makeMessage(overrides: Partial<any> = {}) {
    return {
        hasMedia: false,
        type: undefined,
        rawData: {},
        hasQuotedMsg: false,
        getQuotedMessage: vi.fn(),
        ...overrides,
    };
}

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe("lib/message-media.ts resolveIncomingMedia", () => {
    it("returns empty result when the message has no media and no quoted message", async () => {
        const client = makeClient(() => { throw new Error("should not be called"); });
        const message = makeMessage();

        const result = await resolveIncomingMedia(client, message);

        expect(result).toEqual({ images: [], audioTranscripts: [] });
    });

    it("resolves a directly attached image", async () => {
        const client = makeClient(() => ({ data: "base64data", mimetype: "image/jpeg" }));
        const message = makeMessage({ hasMedia: true, type: "image", rawData: { mimetype: "image/jpeg" } });

        const result = await resolveIncomingMedia(client, message);

        expect(result.images).toEqual([{ data: "base64data", mimetype: "image/jpeg" }]);
        expect(result.audioTranscripts).toEqual([]);
    });

    it("resolves a directly attached voice note by transcribing it", async () => {
        const client = makeClient(() => ({ data: "base64audio", mimetype: "audio/ogg" }));
        const message = makeMessage({ hasMedia: true, type: "ptt", rawData: { mimetype: "audio/ogg" } });
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: "hello from voice note" }),
        }) as any;

        const result = await resolveIncomingMedia(client, message);

        expect(result.audioTranscripts).toEqual(["hello from voice note"]);
        expect(result.images).toEqual([]);
    });

    it("resolves media on a quoted message in addition to the direct message", async () => {
        const client = makeClient((_fn: any, raw: any) =>
            raw.mimetype === "image/png"
                ? { data: "quoted-image", mimetype: "image/png" }
                : { data: "direct-audio", mimetype: "audio/ogg" }
        );
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: "direct transcript" }),
        }) as any;
        const quoted = makeMessage({ hasMedia: true, type: "image", rawData: { mimetype: "image/png" } });
        const message = makeMessage({
            hasMedia: true,
            type: "ptt",
            rawData: { mimetype: "audio/ogg" },
            hasQuotedMsg: true,
            getQuotedMessage: vi.fn().mockResolvedValue(quoted),
        });

        const result = await resolveIncomingMedia(client, message);

        expect(result.images).toEqual([{ data: "quoted-image", mimetype: "image/png" }]);
        expect(result.audioTranscripts).toEqual(["direct transcript"]);
    });

    it("ignores media of an unsupported type", async () => {
        const client = makeClient(() => { throw new Error("should not be called"); });
        const message = makeMessage({ hasMedia: true, type: "document", rawData: {} });

        const result = await resolveIncomingMedia(client, message);

        expect(result).toEqual({ images: [], audioTranscripts: [] });
    });

    it("skips a media item whose download fails, without throwing", async () => {
        const client = makeClient(() => ({ __error: "boom" }));
        const message = makeMessage({ hasMedia: true, type: "image", rawData: {} });

        const result = await resolveIncomingMedia(client, message);

        expect(result).toEqual({ images: [], audioTranscripts: [] });
    });

    it("skips a media item whose transcription fails, without throwing", async () => {
        const client = makeClient(() => ({ data: "base64audio", mimetype: "audio/ogg" }));
        const message = makeMessage({ hasMedia: true, type: "ptt", rawData: {} });
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "stt down" }) as any;

        const result = await resolveIncomingMedia(client, message);

        expect(result).toEqual({ images: [], audioTranscripts: [] });
    });

    it("continues resolving the quoted message even if loading it throws", async () => {
        const client = makeClient(() => ({ data: "direct-image", mimetype: "image/jpeg" }));
        const message = makeMessage({
            hasMedia: true,
            type: "image",
            rawData: { mimetype: "image/jpeg" },
            hasQuotedMsg: true,
            getQuotedMessage: vi.fn().mockRejectedValue(new Error("gone")),
        });

        const result = await resolveIncomingMedia(client, message);

        expect(result.images).toEqual([{ data: "direct-image", mimetype: "image/jpeg" }]);
    });
});
