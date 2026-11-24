import { describe, it, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openConfigsDb, listConfigs, createConfig, updateConfig, deleteConfig, ConfigError } from '../server/utils/model-configs-db'

let db: DatabaseSync
const valid = { name: 'lfm', model: 'LFM3-1.7B', base_url: 'http://llama-server:5050', api_key: 'sk-secret-1234' }
beforeEach(() => { db = openConfigsDb(':memory:') })

describe('model configs db', () => {
  it('list never exposes api_key and shows only the last 4 chars', () => {
    createConfig(db, valid)
    const [c] = listConfigs(db)
    expect(c).toMatchObject({ name: 'lfm', model: 'LFM3-1.7B', base_url: 'http://llama-server:5050', has_key: true, key_tail: '1234' })
    expect(JSON.stringify(listConfigs(db))).not.toContain('sk-secret')
  })
  it('reports no key when none was stored', () => {
    createConfig(db, { ...valid, api_key: '' })
    expect(listConfigs(db)[0]).toMatchObject({ has_key: false, key_tail: '' })
  })
  it('update with a blank key keeps the old key; a new key replaces it', () => {
    const id = createConfig(db, valid)
    updateConfig(db, id, { name: 'lfm2', model: 'm', base_url: 'http://x:1', api_key: '' })
    expect((db.prepare('SELECT api_key FROM model_configs WHERE id = ?').get(id) as any).api_key).toBe('sk-secret-1234')
    updateConfig(db, id, { name: 'lfm2', model: 'm', base_url: 'http://x:1', api_key: 'new-key-9999' })
    expect(listConfigs(db)[0].key_tail).toBe('9999')
  })
  it('rejects a duplicate name', () => {
    createConfig(db, valid)
    expect(() => createConfig(db, valid)).toThrowError(expect.objectContaining({ statusCode: 409 }))
  })
  it('rejects empty fields and an invalid base_url', () => {
    expect(() => createConfig(db, { ...valid, name: ' ' })).toThrow(ConfigError)
    expect(() => createConfig(db, { ...valid, model: '' })).toThrow(ConfigError)
    expect(() => createConfig(db, { ...valid, base_url: 'not a url' })).toThrowError(expect.objectContaining({ statusCode: 400 }))
    expect(() => createConfig(db, { ...valid, base_url: 'ftp://x' })).toThrow(ConfigError)
  })
  it('update of an unknown id is a 404; delete removes the row', () => {
    expect(() => updateConfig(db, 99, { name: 'a', model: 'b', base_url: 'http://x' })).toThrowError(expect.objectContaining({ statusCode: 404 }))
    const id = createConfig(db, valid)
    deleteConfig(db, id)
    expect(listConfigs(db)).toEqual([])
  })
})
