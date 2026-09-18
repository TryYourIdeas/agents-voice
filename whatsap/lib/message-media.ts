// lib/message-media.ts
//
// Resolves image/audio media attached to (or quoted by) an incoming
// WhatsApp message so the agent can see images (vision) and hear audio
// (transcribed to text) — see
// docs/superpowers/specs/2026-09-18-agent-media-from-chat-design.md.

const STT_URL = process.env.STT_URL || 'http://localhost:8001';

export type DownloadedMedia = { data: string; mimetype: string };

// Not using message.downloadMedia() here: it re-fetches the message from
// WhatsApp Web's internal IndexedDB store by id before decrypting, and
// that lookup throws ("DataError: ... No key or key range specified") for
// this self-chat's @lid-addressed messages — the same class of fragile
// internal-Store failure worked around elsewhere in this codebase.
// message.rawData (aka message._data) already has every field the decrypt
// step needs, snapshotted client-side when the event fired, so skip the
// re-fetch and decrypt directly from that. Works for any media type
// (image, audio, ...), not just audio — hence taking rawData directly
// rather than a whole message, so it can be reused for quoted messages too.
export async function downloadMessageMedia(client: any, rawData: any): Promise<DownloadedMedia | undefined> {
    const result = await client.pupPage!.evaluate(async (raw: any) => {
        try {
            const mockQpl = {
                addAnnotations() { return this; },
                addPoint() { return this; },
            };
            // @ts-ignore - window.require/WWebJS are injected by whatsapp-web.js, not typed
            const decrypted = await window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
                directPath: raw.directPath,
                encFilehash: raw.encFilehash,
                filehash: raw.filehash,
                mediaKey: raw.mediaKey,
                mediaKeyTimestamp: raw.mediaKeyTimestamp,
                type: raw.type,
                signal: (new AbortController()).signal,
                downloadQpl: mockQpl,
            });
            // @ts-ignore
            const data = await window.WWebJS.arrayBufferToBase64Async(decrypted);
            return { data, mimetype: raw.mimetype };
        } catch (e: any) {
            return { __error: e?.message || String(e) };
        }
    }, rawData);

    if (!result || '__error' in result) {
        console.error('[debug] downloadMessageMedia failed:', (result as any)?.__error);
        return undefined;
    }
    return result as DownloadedMedia;
}

export async function transcribeAudio(media: DownloadedMedia): Promise<string> {
    const audioBuffer = Buffer.from(media.data, 'base64');
    const form = new FormData();
    form.append('audio', new Blob([audioBuffer], { type: media.mimetype || 'application/octet-stream' }), 'audio');

    const res = await fetch(`${STT_URL}/stt`, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error(`STT request failed: ${res.status} ${await res.text()}`);
    }
    const { text } = await res.json() as { text: string };
    return text;
}

export type ResolvedMedia = {
    images: DownloadedMedia[];
    audioTranscripts: string[];
};

function mediaKind(type: string): 'image' | 'audio' | undefined {
    if (type === 'image') return 'image';
    if (type === 'ptt' || type === 'audio') return 'audio';
    return undefined;
}

async function resolveOne(client: any, message: any, resolved: ResolvedMedia): Promise<void> {
    if (!message?.hasMedia) return;
    const kind = mediaKind(message.type);
    if (!kind) return;

    try {
        const media = await downloadMessageMedia(client, message.rawData);
        if (!media) return;

        if (kind === 'image') {
            resolved.images.push(media);
        } else {
            resolved.audioTranscripts.push(await transcribeAudio(media));
        }
    } catch (err) {
        console.error(`[debug] resolveIncomingMedia: failed to resolve ${kind} media:`, err);
    }
}

// Not using message.getQuotedMessage() here: it does its own internal
// WAWebCollections.Msg.get()/getMessagesById() store lookup by id, which
// throws for this self-chat's @lid-addressed messages — the same class of
// fragile internal-Store failure worked around elsewhere in this codebase
// (see downloadMessageMedia's comment above, and getChatNameById in
// bot.ts). The quoted message's own media descriptor (type, mimetype,
// directPath, encFilehash, mediaKey, ...) is already embedded inline as
// message.rawData.quotedMsg — a snapshot taken when the reply was sent, no
// separate lookup needed — and it already has every field
// downloadMessageMedia's decrypt step needs, so it can be used directly as
// that call's rawData argument.
function quotedMediaCandidate(rawData: any): { hasMedia: true; type: string; rawData: any } | undefined {
    const quotedMsg = rawData?.quotedMsg;
    if (!quotedMsg?.type) return undefined;
    return { hasMedia: true, type: quotedMsg.type, rawData: quotedMsg };
}

// Resolves media attached directly to `message`, and (if present) media on
// the message it quotes/replies to. Each candidate is resolved
// independently — a failure on one (download or transcription) is logged
// and skipped rather than aborting the rest, so e.g. a failed quoted-image
// download doesn't also lose a successfully-transcribed direct voice note.
export async function resolveIncomingMedia(client: any, message: any): Promise<ResolvedMedia> {
    const resolved: ResolvedMedia = { images: [], audioTranscripts: [] };

    await resolveOne(client, message, resolved);

    const quoted = quotedMediaCandidate(message.rawData);
    if (quoted) {
        await resolveOne(client, quoted, resolved);
    }

    return resolved;
}
