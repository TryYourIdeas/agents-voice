// Read-only queries over the agent log database written by whatsap/lib/agent-logs.ts
// (tables `turns` and `events`; schema in whatsap/docs/agent-logs.md).
// Pure functions over a node:sqlite handle so they can be unit-tested with an
// in-memory database. Every query is parameterised and there is no endpoint that
// accepts SQL: the viewer can only run the fixed queries below.
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'

export const PREVIEW_CHARS = 240
export const MAX_LIMIT = 200
export const DEFAULT_LIMIT = 50

let cached: { path: string; db: DatabaseSync } | null = null

/** Opens the log DB read-only; returns null while the file does not exist yet. */
export function openLogsDb(path: string): DatabaseSync | null {
  if (cached && cached.path === path) return cached.db
  if (!existsSync(path)) return null
  const db = new DatabaseSync(path, { readOnly: true })
  db.exec('PRAGMA busy_timeout = 5000')
  cached = { path, db }
  return db
}

export function resetLogsDb(): void {
  try { cached?.db.close() } catch { /* ignore */ }
  cached = null
}

export interface TurnFilters {
  agent?: string
  status?: string
  source?: string
  q?: string
  /** include sub-agent (delegated) turns as rows of their own; default false */
  includeDelegated?: boolean
  limit?: number
  offset?: number
}

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n)
  return Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), lo), hi) : dflt
}

const preview = (s: string | null) => (s && s.length > PREVIEW_CHARS ? s.slice(0, PREVIEW_CHARS) + '…' : s)

export function listTurns(db: DatabaseSync, f: TurnFilters = {}) {
  const where: string[] = []
  const params: (string | number)[] = []
  if (!f.includeDelegated) where.push('t.parent_turn_id IS NULL')
  if (f.agent) { where.push('t.agent = ?'); params.push(f.agent) }
  if (f.status) { where.push('t.status = ?'); params.push(f.status) }
  if (f.source) { where.push('t.source = ?'); params.push(f.source) }
  if (f.q) {
    where.push('(instr(lower(coalesce(t.user_message, \'\')), lower(?)) > 0 OR instr(lower(coalesce(t.final_response, \'\')), lower(?)) > 0)')
    params.push(f.q, f.q)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = clamp(f.limit, 1, MAX_LIMIT, DEFAULT_LIMIT)
  const offset = clamp(f.offset, 0, Number.MAX_SAFE_INTEGER, 0)

  const total = (db.prepare(`SELECT count(*) AS n FROM turns t ${w}`).get(...params) as { n: number }).n
  const rows = db
    .prepare(
      `SELECT t.id, t.parent_turn_id, t.started_at, t.duration_ms, t.device, t.chat_id, t.agent, t.source, t.status,
              t.user_message, t.final_response, t.error,
              (SELECT count(*) FROM turns c WHERE c.parent_turn_id = t.id) AS sub_agent_turns,
              (SELECT count(*) FROM events e WHERE e.turn_id = t.id AND e.kind = 'tool') AS tool_calls
         FROM turns t ${w} ORDER BY t.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Record<string, any>[]
  return {
    total,
    limit,
    offset,
    turns: rows.map((r) => ({ ...r, user_message: preview(r.user_message), final_response: preview(r.final_response) })),
  }
}

export interface TurnDetail {
  [k: string]: any
  events: Record<string, any>[]
  children: TurnDetail[]
}

const MAX_DEPTH = 5

export function getTurn(db: DatabaseSync, id: number, depth = 0): TurnDetail | null {
  const turn = db.prepare('SELECT * FROM turns WHERE id = ?').get(id) as Record<string, any> | undefined
  if (!turn) return null
  const events = db.prepare('SELECT * FROM events WHERE turn_id = ? ORDER BY id').all(id) as Record<string, any>[]
  const children: TurnDetail[] = []
  if (depth < MAX_DEPTH) {
    const ids = db.prepare('SELECT id FROM turns WHERE parent_turn_id = ? ORDER BY id').all(id) as { id: number }[]
    for (const c of ids) {
      const child = getTurn(db, c.id, depth + 1)
      if (child) children.push(child)
    }
  }
  return {
    ...turn,
    events: events.map((e) => ({ ...e, data: parseJson(e.data), input: parseJson(e.input) })),
    children,
  }
}

function parseJson(s: unknown): unknown {
  if (typeof s !== 'string') return s
  try { return JSON.parse(s) } catch { return s }
}

export function getStats(db: DatabaseSync) {
  const totals = db
    .prepare(`SELECT count(*) AS turns, sum(status = 'error') AS errors, sum(status = 'recursion_limit') AS recursion_limits,
                     round(avg(duration_ms)) AS avg_duration_ms FROM turns`)
    .get() as Record<string, number | null>
  const agents = db
    .prepare(`SELECT agent, count(*) AS turns, sum(status != 'ok') AS not_ok, round(avg(duration_ms)) AS avg_duration_ms
                FROM turns GROUP BY agent ORDER BY turns DESC`)
    .all()
  const tools = db
    .prepare(`SELECT name, count(*) AS calls, sum(status = 'error') AS errors, round(avg(duration_ms)) AS avg_duration_ms
                FROM events WHERE kind = 'tool' GROUP BY name ORDER BY calls DESC`)
    .all()
  const tokens = db
    .prepare(`SELECT t.agent, sum(json_extract(e.data, '$.usage.input_tokens')) AS input_tokens,
                     sum(json_extract(e.data, '$.usage.output_tokens')) AS output_tokens
                FROM events e JOIN turns t ON t.id = e.turn_id WHERE e.kind = 'model' GROUP BY t.agent`)
    .all()
  return { totals, agents, tools, tokens }
}
