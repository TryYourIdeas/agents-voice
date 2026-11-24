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

// Older log rows (written before the logger kept `data` valid JSON) may hold truncated JSON, which makes
// json_extract() throw for the whole query; treat those rows as having no usage.
const usage = (col: string, field: string) => `CASE WHEN json_valid(${col}) THEN json_extract(${col}, '$.usage.${field}') END`

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n)
  return Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), lo), hi) : dflt
}

const preview = (s: string | null) => (s && s.length > PREVIEW_CHARS ? s.slice(0, PREVIEW_CHARS) + '…' : s)

// ids of a turn and all of its sub-agent turns, so a row's tokens cover the whole interaction
const TREE_IDS = `(WITH RECURSIVE d(id) AS (SELECT t.id UNION ALL SELECT c.id FROM turns c JOIN d ON c.parent_turn_id = d.id) SELECT id FROM d)`

// Logs written before replays existed lack turns.reasoning_model / turns.replay_of (and the replay_* tables).
const colCache = new WeakMap<DatabaseSync, Set<string>>()
function turnColumns(db: DatabaseSync): Set<string> {
  let c = colCache.get(db)
  // not cached while the columns are missing: the bot may add them while the UI is running
  if (!c || !c.has('reasoning_model')) {
    c = new Set((db.prepare('PRAGMA table_info(turns)').all() as { name: string }[]).map((r) => r.name))
    colCache.set(db, c)
  }
  return c
}

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
  const cols = turnColumns(db)
  const reasoning = cols.has('reasoning_model') ? 't.reasoning_model' : 'NULL AS reasoning_model'
  const replayOf = cols.has('replay_of') ? 't.replay_of' : 'NULL AS replay_of'
  const rows = db
    .prepare(
      `SELECT t.id, t.parent_turn_id, ${reasoning}, ${replayOf}, t.started_at, t.duration_ms, t.device, t.chat_id, t.agent, t.source, t.status,
              t.user_message, t.final_response, t.error,
              (SELECT count(*) FROM turns c WHERE c.parent_turn_id = t.id) AS sub_agent_turns,
              (SELECT count(*) FROM events e WHERE e.turn_id = t.id AND e.kind = 'tool') AS tool_calls,
              (SELECT sum(${usage('e.data', 'input_tokens')}) FROM events e WHERE e.kind = 'model' AND e.turn_id IN ${TREE_IDS}) AS input_tokens,
              (SELECT sum(${usage('e.data', 'output_tokens')}) FROM events e WHERE e.kind = 'model' AND e.turn_id IN ${TREE_IDS}) AS output_tokens
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

export interface TokenTotals { input_tokens: number; output_tokens: number }

export interface TurnDetail {
  [k: string]: any
  /** tokens used by this turn's own model calls */
  tokens: TokenTotals
  /** tokens including all sub-agent turns */
  tokens_total: TokenTotals
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
  const parsed = events.map((e) => ({ ...e, data: parseJson(e.data), input: parseJson(e.input) }))
  const tokens = { input_tokens: 0, output_tokens: 0 }
  for (const e of parsed) {
    const u = e.kind === 'model' ? (e.data as any)?.usage : null
    tokens.input_tokens += Number(u?.input_tokens) || 0
    tokens.output_tokens += Number(u?.output_tokens) || 0
  }
  const tokens_total = { ...tokens }
  for (const c of children) {
    tokens_total.input_tokens += c.tokens_total.input_tokens
    tokens_total.output_tokens += c.tokens_total.output_tokens
  }
  return { ...turn, events: parsed, children, tokens, tokens_total }
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
    .prepare(`SELECT t.agent, sum(${usage('e.data', 'input_tokens')}) AS input_tokens,
                     sum(${usage('e.data', 'output_tokens')}) AS output_tokens
                FROM events e JOIN turns t ON t.id = e.turn_id WHERE e.kind = 'model' GROUP BY t.agent`)
    .all()
  const grand = db
    .prepare(`SELECT sum(${usage('data', 'input_tokens')}) AS input_tokens,
                     sum(${usage('data', 'output_tokens')}) AS output_tokens
                FROM events WHERE kind = 'model'`)
    .get() as Record<string, number | null>
  return { totals: { ...totals, input_tokens: grand.input_tokens ?? 0, output_tokens: grand.output_tokens ?? 0 }, agents, tools, tokens }
}

export interface SandboxEmailRow { uid: number; from: string; to: string; subject: string; date: string | null; body: string; inReplyToUid: number | null }
export interface Sandbox {
  files: { path: string; content: string; origin: string }[]
  inbox: SandboxEmailRow[]
  sent: SandboxEmailRow[]
  messages: { seq: number; kind: string; text: string; ts: string }[]
}

/** Mock chat / files / mailbox a replay ended up with. Empty (not an error) for logs without the replay tables. */
export function getSandbox(db: DatabaseSync, turnId: number): Sandbox {
  const out: Sandbox = { files: [], inbox: [], sent: [], messages: [] }
  try {
    out.files = db.prepare('SELECT path, content, origin FROM replay_files WHERE turn_id = ? ORDER BY path').all(turnId) as any
    const mail = db
      .prepare('SELECT folder, uid, from_addr, to_addr, subject, date, body, in_reply_to_uid FROM replay_emails WHERE turn_id = ? ORDER BY folder, uid')
      .all(turnId) as any[]
    for (const m of mail) {
      const e = { uid: m.uid, from: m.from_addr, to: m.to_addr, subject: m.subject, date: m.date, body: m.body, inReplyToUid: m.in_reply_to_uid }
      ;(m.folder === 'sent' ? out.sent : out.inbox).push(e)
    }
    out.messages = db.prepare('SELECT seq, kind, text, ts FROM replay_messages WHERE turn_id = ? ORDER BY seq').all(turnId) as any
  } catch {
    // table missing: an old log DB
  }
  return out
}
