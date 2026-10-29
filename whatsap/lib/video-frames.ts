// lib/video-frames.ts
//
// Turns a video into a few evenly-spaced JPEG frames so a vision LLM that only
// accepts images (LFM3-VL via llama-server) can "watch" it. Opt-in via
// VIDEO_FRAMES (count, default 0 = videos ignored).

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function videoFrameCount(): number {
    const n = Number.parseInt(process.env.VIDEO_FRAMES || '0', 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 16) : 0;
}

function run(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args);
        let out = '', err = '';
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', (d) => (err += d));
        p.on('error', reject);
        p.on('close', (c) => (c === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${c}: ${err.slice(0, 300)}`))));
    });
}

export async function extractVideoFrames(base64: string, count: number): Promise<{ data: string; mimetype: string }[]> {
    const dir = await mkdtemp(path.join(tmpdir(), 'vid-'));
    try {
        const src = path.join(dir, 'in.mp4');
        await writeFile(src, Buffer.from(base64, 'base64'));
        const duration = Number.parseFloat(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src])) || 1;
        // fps chosen so `count` frames span the whole clip; -frames:v caps it.
        await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src,
            '-vf', `fps=${count / duration},scale='min(768,iw)':-2`, '-frames:v', String(count),
            path.join(dir, 'f%02d.jpg')]);
        const files = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
        return Promise.all(files.map(async (f) => ({
            data: (await readFile(path.join(dir, f))).toString('base64'),
            mimetype: 'image/jpeg',
        })));
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
