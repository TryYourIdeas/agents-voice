// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let dir: string
let body: any
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('useRuntimeConfig', () => ({ newDevicesDir: dir }))
vi.stubGlobal('readBody', async () => body)
vi.stubGlobal('createError', (o: any) => Object.assign(new Error(o.statusMessage), o))
const handler = (await import('../server/api/new-device.post')).default as (e: any) => Promise<any>

beforeEach(() => { dir = path.join(mkdtempSync(path.join(tmpdir(), 'newdev-')), 'nested') })

describe('POST /api/new-device', () => {
  it('writes the device request file the bot watches', async () => {
    body = { name: 'luis-cel', label: 'Luis phone' }
    expect(await handler({})).toEqual({ name: 'luis-cel', label: 'Luis phone' })
    expect(readFileSync(path.join(dir, 'luis-cel.md'), 'utf-8')).toBe('---\nname: luis-cel\nlabel: Luis phone\n---\n')
  })
  it('defaults the label to the name and keeps it on one line', async () => {
    body = { name: 'a1' }
    expect((await handler({})).label).toBe('a1')
    body = { name: 'b2', label: 'x\nname: evil' }
    await handler({})
    expect(readFileSync(path.join(dir, 'b2.md'), 'utf-8')).toBe('---\nname: b2\nlabel: x name: evil\n---\n')
  })
  it('rejects bad names without touching the disk', async () => {
    body = { name: '../escape' }
    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
    expect(existsSync(dir)).toBe(false)
  })
  it('refuses duplicates with 409', async () => {
    body = { name: 'dup' }
    await handler({})
    await expect(handler({})).rejects.toMatchObject({ statusCode: 409 })
    expect(readdirSync(dir)).toEqual(['dup.md'])
  })
})
