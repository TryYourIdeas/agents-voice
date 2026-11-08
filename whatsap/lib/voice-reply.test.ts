import { describe, it, expect } from 'vitest';
import { speakableText, voiceReplyEnabled, splitForTts } from './voice-reply.ts';

describe('speakableText', () => {
    it('strips markdown, links, code blocks and diagram markers', () => {
        const out = speakableText('**Hi** [site](http://x.y) [[DIAGRAM:/a.png]]\n```ts\nx\n```');
        expect(out).toBe('Hi site code omitted.');
    });
});

describe('voiceReplyEnabled', () => {
    it('requires VOICE_REPLY=true and TTS_URL', () => {
        delete process.env.VOICE_REPLY; delete process.env.TTS_URL;
        expect(voiceReplyEnabled()).toBe(false);
        process.env.VOICE_REPLY = 'true'; process.env.TTS_URL = 'http://tts';
        expect(voiceReplyEnabled()).toBe(true);
        delete process.env.VOICE_REPLY; delete process.env.TTS_URL;
    });
});

describe('splitForTts', () => {
    it('returns short text as a single chunk', () => {
        expect(splitForTts('Hello there.', 100)).toEqual(['Hello there.']);
    });
    it('splits at sentence boundaries without exceeding the limit', () => {
        const text = 'One two three. Four five six. Seven eight nine. Ten.';
        const chunks = splitForTts(text, 30);
        expect(chunks.every((c) => c.length <= 30)).toBe(true);
        expect(chunks.join(' ')).toBe(text);
        expect(chunks[0]).toBe('One two three. Four five six.');
    });
    it('hard-splits a sentence longer than the limit at word boundaries', () => {
        const text = 'word '.repeat(50).trim();
        const chunks = splitForTts(text, 40);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((c) => c.length <= 40)).toBe(true);
        expect(chunks.join(' ')).toBe(text);
    });
    it('splits an unbroken token longer than the limit', () => {
        const chunks = splitForTts('x'.repeat(95), 40);
        expect(chunks.map((c) => c.length)).toEqual([40, 40, 15]);
    });
});
