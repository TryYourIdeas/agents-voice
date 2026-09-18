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

    it("resolves media on a quoted message (embedded inline, not via a store lookup) in addition to the direct message", async () => {
        // Mirrors WhatsApp's actual wire shape: a reply's own rawData carries
        // the quoted message's full media descriptor inline as `quotedMsg`
        // (type/mimetype/directPath/encFilehash/mediaKey/...) — no separate
        // async lookup. See lib/message-media.ts's quotedMediaCandidate doc
        // comment for why message.getQuotedMessage() is deliberately not used.
        const client = makeClient((_fn: any, raw: any) =>
            raw.mimetype === "image/png"
                ? { data: "quoted-image", mimetype: "image/png" }
                : { data: "direct-audio", mimetype: "audio/ogg" }
        );
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: "direct transcript" }),
        }) as any;
        const message = makeMessage({
            hasMedia: true,
            type: "ptt",
            rawData: {
                mimetype: "audio/ogg",
                quotedMsg: { type: "image", mimetype: "image/png" },
            },
        });

        const result = await resolveIncomingMedia(client, message);

        expect(result.images).toEqual([{ data: "quoted-image", mimetype: "image/png" }]);
        expect(result.audioTranscripts).toEqual(["direct transcript"]);
    });

    it("resolves media on a quoted message when the message itself has no direct media", async () => {
        const client = makeClient(() => ({ data: "quoted-audio", mimetype: "audio/mpeg" }));
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: "quoted transcript" }),
        }) as any;
        const message = makeMessage({
            hasMedia: false,
            rawData: { quotedMsg: { type: "audio", mimetype: "audio/mpeg" } },
        });

        const result = await resolveIncomingMedia(client, message);

        expect(result.audioTranscripts).toEqual(["quoted transcript"]);
    });

    it("ignores media of an unsupported type", async () => {
        const client = makeClient(() => { throw new Error("should not be called"); });
        const message = makeMessage({ hasMedia: true, type: "document", rawData: {} });

        const result = await resolveIncomingMedia(client, message);

        expect(result).toEqual({ images: [], audioTranscripts: [] });
    });

    it("ignores a quotedMsg with no type", async () => {
        const client = makeClient(() => { throw new Error("should not be called"); });
        const message = makeMessage({ rawData: { quotedMsg: {} } });

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

    it("a failing quoted-media download doesn't affect a successfully resolved direct attachment", async () => {
        const client = makeClient((_fn: any, raw: any) =>
            raw.mimetype === "image/jpeg" ? { data: "direct-image", mimetype: "image/jpeg" } : { __error: "boom" }
        );
        const message = makeMessage({
            hasMedia: true,
            type: "image",
            rawData: {
                mimetype: "image/jpeg",
                quotedMsg: { type: "audio", mimetype: "audio/ogg" },
            },
        });

        const result = await resolveIncomingMedia(client, message);

        expect(result.images).toEqual([{ data: "direct-image", mimetype: "image/jpeg" }]);
        expect(result.audioTranscripts).toEqual([]);
    });
});
