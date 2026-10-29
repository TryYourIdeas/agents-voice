// lib/voice-reply.ts
//
// Text-to-speech for voice-note replies. Opt-in: only active when
// VOICE_REPLY=true and TTS_URL is set (see whatsap-lfm3-stt-tts-docker-compose.yml);
// otherwise callers fall back to a normal text reply.

import { spawn } from 'node:child_process';

const DEBUG = ['1', 'true'].includes((process.env.NUXT_ADD_DEBUG_LOGS || '').toLowerCase());

export function voiceReplyEnabled(): boolean {
    return process.env.VOICE_REPLY === 'true' && !!process.env.TTS_URL;
}

// Strip markdown / diagram markers that would be read out loud as noise.
export function speakableText(text: string): string {
    return text
        .replace(/\[\[DIAGRAM:[^\]]+\]\]/g, '')
        .replace(/```[\s\S]*?```/g, ' code omitted. ')
        .replace(/[*_`#>]+/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

// WhatsApp voice notes are Ogg/Opus; the TTS service returns 24kHz WAV.
function wavToOggOpus(wav: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
            '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', 'pipe:1']);
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        ff.stdout.on('data', (d) => out.push(d));
        ff.stderr.on('data', (d) => err.push(d));
        ff.on('error', reject);
        ff.on('close', (code) => code === 0
            ? resolve(Buffer.concat(out))
            : reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`)));
        ff.stdin.end(wav);
    });
}

export async function synthesizeVoiceNote(text: string): Promise<{ data: string; mimetype: string }> {
    const spoken = speakableText(text);
    if (!spoken) throw new Error('nothing speakable in reply');
    const res = await fetch(`${process.env.TTS_URL}/tts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: spoken, voice: process.env.TTS_VOICE || 'female' }),
    });
    if (!res.ok) throw new Error(`TTS request failed: ${res.status} ${await res.text()}`);
    const wav = Buffer.from(await res.arrayBuffer());
    const ogg = await wavToOggOpus(wav);
    if (DEBUG) console.log(`[debug] voice-reply: ${spoken.length} chars -> ${ogg.length} bytes ogg/opus`);
    return { data: ogg.toString('base64'), mimetype: 'audio/ogg; codecs=opus' };
}

// Why WhatsApp rejects a voice note: whatsapp-web.js's sendMessage ->
// WWebJS.processMediaData runs prepRawMedia() on the file and then calls
// getOrCreateMediaObject(mediaData.filehash). The "id" the memoized getter
// complains about is that filehash (SHA-256 of the media), so "got undefined"
// means prepRawMedia returned without hashing the file — i.e. it did not accept
// our audio. This replays only the prep step in the page (nothing is sent) with
// and without the voice-note flag and reports what prep produced.
export async function diagnoseMediaPrep(client: any, note: { data: string; mimetype: string }): Promise<unknown> {
    return client.pupPage.evaluate(async (data: string, mimetype: string) => {
        const out: Record<string, unknown> = {};
        for (const isPtt of [true, false]) {
            const key = isPtt ? 'ptt' : 'audio';
            try {
                // @ts-ignore - injected by whatsapp-web.js, not typed
                const file = window.WWebJS.mediaInfoToFile({ data, mimetype, filename: 'voice.ogg' });
                // @ts-ignore
                const Opaque = window.require('WAWebMediaOpaqueData');
                const opaque = await Opaque.createFromData(file, mimetype);
                // @ts-ignore
                const md = await window.require('WAWebPrepRawMedia').prepRawMedia(opaque, { isPtt }).waitForPrep();
                out[key] = { fileType: file.type, fileSize: file.size, mediaType: md.type, filehash: md.filehash ?? null,
                    mimetype: md.mimetype, size: md.size, duration: md.duration, keys: Object.keys(md) };
            } catch (e: any) {
                out[key] = { error: e?.message || String(e) };
            }
        }
        return out;
    }, note.data, note.mimetype);
}
