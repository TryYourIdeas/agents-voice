import { describe, it, expect } from 'vitest';
import { speakableText, voiceReplyEnabled } from './voice-reply.ts';

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
