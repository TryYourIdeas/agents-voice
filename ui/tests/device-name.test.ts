// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.stubGlobal('createError', (o: any) => Object.assign(new Error(o.statusMessage), o))
const { DEVICE_NAME_RE, requireDeviceName } = await import('../server/utils/device-name')

describe('requireDeviceName', () => {
  it.each(['primary', 'luis-cel', 'a1', 'x'.repeat(64)])('accepts %s', (n) => expect(requireDeviceName(n)).toBe(n))
  it.each(['', undefined, '../etc', 'a/b', 'a b', 'Upper', '-start', 'x'.repeat(65), 'a%2F..', 'a\nb'])('rejects %j with 400', (n) => {
    expect(() => requireDeviceName(n as any)).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })
  it('matches the pattern the bot uses for device names', () => expect(DEVICE_NAME_RE.test('ok-1')).toBe(true))
})
