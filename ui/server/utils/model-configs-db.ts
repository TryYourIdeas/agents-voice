// Model configurations (name, model, base URL, API key) used to replay logged turns with another model.
// Stored in their own SQLite file, separate from the agent log DB (which the UI opens read-only).
// The bot reads the same file by id at replay time (whatsap/lib/model-configs.ts).
// API keys are stored in plain text, like .env, and are NEVER returned by any function here.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export class ConfigError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
  }
}

export interface ConfigInput { name: string; model: string; base_url: string; api_key?: string }
export interface ConfigRow { id: number; name: string; model: string; base_url: string; has_key: boolean; key_tail: string }

const SCHEMA = `CREATE TABLE IF NOT EXISTS model_configs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  model      TEXT NOT NULL,
  base_url   TEXT NOT NULL,
  api_key    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`

const cache = new Map<string, DatabaseSync>()

/** Opens (creating if needed) the read-write configurations DB. ':memory:' is never cached. */
export function openConfigsDb(path: string): DatabaseSync {
  const hit = cache.get(path)
  if (hit) return hit
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)
  if (path !== ':memory:') cache.set(path, db)
  return db
}

function clean(i: ConfigInput) {
  const name = String(i.name ?? '').trim()
  const model = String(i.model ?? '').trim()
  const baseUrl = String(i.base_url ?? '').trim()
  if (!name) throw new ConfigError('Name is required.', 400)
  if (!model) throw new ConfigError('Model name is required.', 400)
  try {
    const u = new URL(baseUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol')
  } catch {
    throw new ConfigError('Base URL must be a valid http(s) URL.', 400)
  }
  return { name, model, baseUrl, apiKey: String(i.api_key ?? '').trim() }
}

const duplicate = (e: any, name: string) =>
  /UNIQUE/i.test(String(e?.message)) ? new ConfigError(`A configuration named "${name}" already exists.`, 409) : e

export function listConfigs(db: DatabaseSync): ConfigRow[] {
  const rows = db.prepare('SELECT id, name, model, base_url, api_key FROM model_configs ORDER BY name').all() as any[]
  return rows.map((r) => ({ id: r.id, name: r.name, model: r.model, base_url: r.base_url, has_key: r.api_key !== '', key_tail: String(r.api_key).slice(-4) }))
}

export function createConfig(db: DatabaseSync, input: ConfigInput): number {
  const c = clean(input)
  const now = new Date().toISOString()
  try {
    return Number(db.prepare('INSERT INTO model_configs (name, model, base_url, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(c.name, c.model, c.baseUrl, c.apiKey, now, now).lastInsertRowid)
  } catch (e) {
    throw duplicate(e, c.name)
  }
}

/** A blank/undefined api_key keeps the stored one. */
export function updateConfig(db: DatabaseSync, id: number, input: ConfigInput): void {
  const c = clean(input)
  try {
    const r = c.apiKey
      ? db.prepare('UPDATE model_configs SET name = ?, model = ?, base_url = ?, api_key = ?, updated_at = ? WHERE id = ?').run(c.name, c.model, c.baseUrl, c.apiKey, new Date().toISOString(), id)
      : db.prepare('UPDATE model_configs SET name = ?, model = ?, base_url = ?, updated_at = ? WHERE id = ?').run(c.name, c.model, c.baseUrl, new Date().toISOString(), id)
    if (!r.changes) throw new ConfigError(`Model configuration ${id} not found.`, 404)
  } catch (e) {
    throw duplicate(e, c.name)
  }
}

export function deleteConfig(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM model_configs WHERE id = ?').run(id)
}

/** For Nitro handlers: the DB at runtimeConfig.modelConfigsDb. */
export function requireConfigsDb(event: Parameters<typeof useRuntimeConfig>[0]) {
  return openConfigsDb(useRuntimeConfig(event).modelConfigsDb as string)
}

/** Maps a ConfigError to an HTTP error; never echoes anything but the message. */
export function toHttpError(e: any) {
  if (e instanceof ConfigError) return createError({ statusCode: e.statusCode, statusMessage: e.message })
  console.error('[model-configs] unexpected error:', e?.message ?? e)
  return createError({ statusCode: 500, statusMessage: 'Could not save the model configuration.' })
}
