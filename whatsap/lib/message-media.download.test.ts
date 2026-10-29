import { describe, it, expect, vi } from 'vitest';
import { downloadMessageMedia } from './message-media.ts';

// pupPage.evaluate(fn, raw, type) -> we only fake its result per `type`.
function clientWith(byType: Record<string, any>, store?: any, withMime?: any) {
    return { pupPage: { evaluate: vi.fn(async (_fn: any, a: any, b: any, c?: boolean) => (typeof a === 'string' ? store : c && withMime ? withMime : byType[b])) } };
}

describe('downloadMessageMedia', () => {
    const raw = { type: 'ptt', mimetype: 'audio/ogg; codecs=opus' };

    it('retries a ptt as audio after an "Unexpected mimetype" error', async () => {
        const client = clientWith({
            ptt: { __error: 'Unexpected mimetype application/octet-stream for media type ptt' },
            audio: { data: 'QUJD', mimetype: raw.mimetype },
        });
        const media = await downloadMessageMedia(client, raw);
        expect(media?.data).toBe('QUJD');
        expect(client.pupPage.evaluate).toHaveBeenCalledTimes(2);
    });

    it('succeeds when passing the mimetype explicitly', async () => {
        const rejected = { __error: 'Unexpected mimetype application/octet-stream for media type ptt' };
        const client = clientWith({ ptt: rejected, audio: rejected }, undefined, { data: 'TUlN', mimetype: raw.mimetype });
        expect((await downloadMessageMedia(client, raw))?.data).toBe('TUlN');
        expect(client.pupPage.evaluate).toHaveBeenCalledTimes(3);
    });

    it('does not retry on unrelated errors', async () => {
        const client = clientWith({ ptt: { __error: 'boom' } });
        expect(await downloadMessageMedia(client, raw)).toBeUndefined();
        expect(client.pupPage.evaluate).toHaveBeenCalledTimes(1);
    });

    it('falls back to the in-page store download when both types are rejected', async () => {
        const rejected = { __error: 'Unexpected mimetype application/octet-stream for media type x' };
        const client = clientWith({ ptt: rejected, audio: rejected }, { data: 'REVG', mimetype: 'audio/ogg; codecs=opus' });
        const media = await downloadMessageMedia(client, raw, 'true_1@c.us_ABC');
        expect(media?.data).toBe('REVG');
        expect(client.pupPage.evaluate).toHaveBeenCalledTimes(4); // type, alt type, explicit mimetype, store
    });
});

import { messageIdOf } from './message-media.ts';

describe('messageIdOf', () => {
    it('handles serialized, plain-object and string ids', () => {
        expect(messageIdOf({ id: { _serialized: 'true_a@c.us_X' } })).toBe('true_a@c.us_X');
        expect(messageIdOf({ id: { fromMe: false, remote: 'a@c.us', id: 'X' } })).toBe('false_a@c.us_X');
        expect(messageIdOf({ id: { $1: 'true_a@c.us_Y' } })).toBe('true_a@c.us_Y');
        expect(messageIdOf({ id: 'true_a@c.us_X' })).toBe('true_a@c.us_X');
        expect(messageIdOf({ rawData: { id: { _serialized: 'r' } } })).toBe('r');
    });
});
