// lib/voice-reply.ts
//
// Text-to-speech for voice-note replies. Opt-in: only active when
// VOICE_REPLY=true and TTS_URL is set (see whatsap-lfm3-stt-tts-docker-compose.yml);
// otherwise callers fall back to a normal text reply.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

// lfm3-audio rejects /tts text over LFM3_TTS_MAX_CHARS (default 1500) with a 413,
// so long replies are synthesized in sentence-aligned pieces and joined.
const TTS_CHUNK_CHARS = Number(process.env.TTS_CHUNK_CHARS) || 1200;
// Beyond this a voice note is impractically long (and slow to generate); callers
// fall back to a text reply instead.
const TTS_MAX_TOTAL_CHARS = Number(process.env.TTS_MAX_TOTAL_CHARS) || 6000;

export function splitForTts(text: string, max: number): string[] {
    const pieces: string[] = [];
    // Sentences (kept with their trailing punctuation); anything left over is its own piece.
    for (const sentence of text.match(/[^.!?\n]+(?:[.!?]+|\n|$)\s*/g) ?? [text]) {
        let rest = sentence.trim();
        while (rest.length > max) {
            let cut = rest.lastIndexOf(' ', max);
            if (cut <= 0) cut = max;
            pieces.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trim();
        }
        if (rest) pieces.push(rest);
    }
    const chunks: string[] = [];
    for (const piece of pieces) {
        const last = chunks[chunks.length - 1];
        if (last !== undefined && last.length + 1 + piece.length <= max) chunks[chunks.length - 1] = `${last} ${piece}`;
        else chunks.push(piece);
    }
    return chunks;
}

// WhatsApp voice notes are Ogg/Opus; the TTS service returns 24kHz WAV.
function wavsToOggOpus(wavs: Buffer[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
        const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
        const files = wavs.map((w, i) => {
            const f = path.join(dir, `${i}.wav`);
            fs.writeFileSync(f, w);
            return f;
        });
        const inputs = files.flatMap((f) => ['-i', f]);
        const filter = files.length > 1
            ? ['-filter_complex', `${files.map((_, i) => `[${i}:a]`).join('')}concat=n=${files.length}:v=0:a=1[out]`, '-map', '[out]']
            : [];
        const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...inputs, ...filter,
            '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', 'pipe:1']);
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        ff.stdout.on('data', (d) => out.push(d));
        ff.stderr.on('data', (d) => err.push(d));
        ff.on('error', (e) => { cleanup(); reject(e); });
        ff.on('close', (code) => {
            cleanup();
            code === 0
                ? resolve(Buffer.concat(out))
                : reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`));
        });
    });
}

export async function synthesizeVoiceNote(text: string): Promise<{ data: string; mimetype: string }> {
    const spoken = speakableText(text);
    if (!spoken) throw new Error('nothing speakable in reply');
    if (spoken.length > TTS_MAX_TOTAL_CHARS) {
        throw new Error(`reply too long for a voice note (${spoken.length} > ${TTS_MAX_TOTAL_CHARS} chars)`);
    }
    const wavs: Buffer[] = [];
    for (const chunk of splitForTts(spoken, TTS_CHUNK_CHARS)) {
        const res = await fetch(`${process.env.TTS_URL}/tts`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: chunk, voice: process.env.TTS_VOICE || 'female' }),
        });
        if (!res.ok) throw new Error(`TTS request failed: ${res.status} ${await res.text()}`);
        wavs.push(Buffer.from(await res.arrayBuffer()));
    }
    const ogg = await wavsToOggOpus(wavs);
    if (DEBUG) console.log(`[debug] voice-reply: ${spoken.length} chars in ${wavs.length} chunk(s) -> ${ogg.length} bytes ogg/opus`);
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
