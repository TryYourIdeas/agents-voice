// lib/message-media.ts
//
// Resolves image/audio media attached to (or quoted by) an incoming
// WhatsApp message so the agent can see images (vision) and hear audio
// (transcribed to text) — see
// docs/superpowers/specs/2026-09-18-agent-media-from-chat-design.md.

import { extractVideoFrames, videoFrameCount } from './video-frames.ts';

const STT_URL = process.env.STT_URL || 'http://localhost:8001';

export type DownloadedMedia = { data: string; mimetype: string };

// Fallback mirroring whatsapp-web.js main's WWebJS.resolveMediaBlob: newer
// WhatsApp Web builds reject the hand-rolled downloadAndMaybeDecrypt call above
// ("Unexpected mimetype application/octet-stream for media type ptt/audio"),
// so let WhatsApp's own message model download + decrypt, then read the blob
// back from its in-memory cache. Needs the message to be in the Store, so it
// only works when rawData carries an id (not for quotedMsg snapshots).
// Message ids show up in several shapes depending on how the Message was
// built (MsgKey object with _serialized, plain {fromMe, remote, id}, a bare
// string); normalize to the "<fromMe>_<remote>_<id>" string the Store keys on.
export function messageIdOf(message: any): string | undefined {
    for (const id of [message?.id, message?.rawData?.id, message?._data?.id]) {
        if (!id) continue;
        if (typeof id === 'string') return id;
        // WhatsApp renamed id._serialized to id.$1 (July 2026); 1.34.7 doesn't normalize it.
        if (typeof id._serialized === 'string') return id._serialized;
        if (typeof id.$1 === 'string') return id.$1;
        const remote = id.remote?._serialized ?? (typeof id.remote === 'string' ? id.remote : undefined);
        if (remote && id.id !== undefined) return `${id.fromMe ? 'true' : 'false'}_${remote}_${id.id}${id.participant ? `_${id.participant?._serialized ?? id.participant}` : ''}`;
    }
    console.error('[debug] messageIdOf: no usable id; message.id =', JSON.stringify(message?.id), 'keys:', Object.keys(message?.rawData ?? {}).join(','));
    return undefined;
}

async function evaluateStoreDownload(client: any, raw: any, messageId?: string): Promise<DownloadedMedia | { __error: string }> {
    // rawData's own id shape varies (and is absent here), so callers pass the
    // Message's id._serialized explicitly.
    const msgId = messageId ?? raw?.id?._serialized ?? (typeof raw?.id === 'string' ? raw.id : undefined);
    if (!msgId) return { __error: 'no message id for store download' };
    return client.pupPage!.evaluate(async (msgId: string, mimetype: string) => {
        try {
            // @ts-ignore - window.require is whatsapp-web.js's module loader, not typed
            const { Msg } = window.require('WAWebCollections');
            let via = 'Msg.get';
            let msg = Msg.get(msgId);
            if (!msg) { via = 'getMessagesById'; msg = (await Msg.getMessagesById([msgId]))?.messages?.[0]; }
            if (!msg) {
                // Self-chat @lid messages may only be reachable through their chat's own collection.
                via = 'chat.msgs';
                const { Chat } = window.require('WAWebCollections');
                const chat = Chat.get(msgId.split('_')[1]);
                msg = chat?.msgs?.get?.(msgId) ?? chat?.msgs?.getModelsArray?.().find((m: any) => m.id?._serialized === msgId);
            }
            if (!msg?.mediaData) return { __error: `message ${msgId} ${msg ? 'has no mediaData' : 'not found'} (tried Msg.get, getMessagesById, chat.msgs; last=${via})` };
            await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1, isUserInitiated: true });
            if (msg.mediaData.mediaStage.includes('ERROR') || msg.mediaData.mediaStage === 'FETCHING') {
                return { __error: `store download ended in stage ${msg.mediaData.mediaStage}` };
            }
            // @ts-ignore
            const cache = window.require('WAWebMediaInMemoryBlobCache').InMemoryMediaBlobCache;
            const blob = cache.get(msg.mediaObject?.filehash) ?? await msg.mediaObject?.mediaBlob?.forceToBlob();
            if (!blob) return { __error: 'store download produced no blob' };
            const data: string = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
                r.onerror = () => reject(r.error);
                r.readAsDataURL(blob);
            });
            return { data, mimetype: msg.mimetype || mimetype };
        } catch (e: any) {
            return { __error: e?.message || String(e) };
        }
    }, msgId, raw.mimetype);
}

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
// WhatsApp Web's download manager validates the media `type` against what the
// CDN returned, and rejects some voice notes with "Unexpected mimetype
// application/octet-stream for media type ptt". Retry once with the alternate
// type name ('audio' <-> 'ptt') before giving up.
const ALT_MEDIA_TYPE: Record<string, string> = { ptt: 'audio', audio: 'ptt' };

async function evaluateDownload(client: any, raw: any, type: string, withMimetype = false): Promise<DownloadedMedia | { __error: string }> {
    return client.pupPage!.evaluate(async (raw: any, type: string, withMimetype: boolean) => {
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
                type,
                // Newer WhatsApp Web builds appear to validate the CDN content-type
                // against the declared mimetype, defaulting to octet-stream when absent.
                ...(withMimetype ? { mimetype: raw.mimetype } : {}),
                signal: (new AbortController()).signal,
                downloadQpl: mockQpl,
            });
            // @ts-ignore
            const data = await window.WWebJS.arrayBufferToBase64Async(decrypted);
            return { data, mimetype: raw.mimetype };
        } catch (e: any) {
            return { __error: e?.message || String(e) };
        }
    }, raw, type, withMimetype);
}

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
export async function downloadMessageMedia(client: any, rawData: any, messageId?: string): Promise<DownloadedMedia | undefined> {
    let result = await evaluateDownload(client, rawData, rawData.type);

    const alt = ALT_MEDIA_TYPE[rawData?.type];
    if ('__error' in result && /Unexpected mimetype/i.test(result.__error) && alt) {
        console.error(`[debug] downloadMessageMedia: '${result.__error}' (mimetype=${rawData.mimetype}); retrying as type '${alt}'`);
        result = await evaluateDownload(client, rawData, alt);
    }

    if ('__error' in result && /Unexpected mimetype/i.test(result.__error)) {
        console.error('[debug] downloadMessageMedia: retrying with explicit mimetype');
        result = await evaluateDownload(client, rawData, rawData.type, true);
        if (!('__error' in result)) return result;
        console.error('[debug] downloadMessageMedia: explicit mimetype failed:', result.__error);
        console.error('[debug] downloadMessageMedia: direct decrypt rejected; trying store download');
        const viaStore = await evaluateStoreDownload(client, rawData, messageId);
        if (!('__error' in viaStore)) return viaStore;
        console.error('[debug] downloadMessageMedia: store download failed:', viaStore.__error);
    }

    if (!result || '__error' in result) {
        console.error(`[debug] downloadMessageMedia failed (type=${rawData?.type} mimetype=${rawData?.mimetype}):`, (result as any)?.__error);
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

function mediaKind(type: string): 'image' | 'audio' | 'video' | undefined {
    if (type === 'image') return 'image';
    if (type === 'video' && videoFrameCount() > 0) return 'video';
    if (type === 'ptt' || type === 'audio') return 'audio';
    return undefined;
}

async function resolveOne(client: any, message: any, resolved: ResolvedMedia): Promise<void> {
    if (!message?.hasMedia) return;
    const kind = mediaKind(message.type);
    if (!kind) return;

    try {
        const media = await downloadMessageMedia(client, message.rawData, messageIdOf(message));
        if (!media) return;

        if (kind === 'image') {
            resolved.images.push(media);
        } else if (kind === 'video') {
            resolved.images.push(...await extractVideoFrames(media.data, videoFrameCount()));
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
