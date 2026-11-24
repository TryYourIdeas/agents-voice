// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

const proxyRequest = vi.fn(async (_e: any, target: string) => ({ target }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('useRuntimeConfig', () => ({ whatsapApiUrl: 'http://whatsap:4001' }))
vi.stubGlobal('proxyRequest', proxyRequest)
const handler = (await import('../server/api/replay.post')).default as (e: any) => Promise<any>

describe('POST /api/replay', () => {
  it("forwards to the bot's internal /api/replay without touching the body", async () => {
    const event = { id: 'e' }
    expect(await handler(event)).toEqual({ target: 'http://whatsap:4001/api/replay' })
    expect(proxyRequest).toHaveBeenCalledWith(event, 'http://whatsap:4001/api/replay')
  })
})
