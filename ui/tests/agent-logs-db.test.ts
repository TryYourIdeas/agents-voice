// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { listTurns, getTurn, getStats, getSandbox, PREVIEW_CHARS, MAX_LIMIT } from '../server/utils/agent-logs-db'

// Same schema as whatsap/lib/agent-logs.ts
const SCHEMA = `
CREATE TABLE turns (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_turn_id INTEGER, started_at TEXT, ended_at TEXT, duration_ms INTEGER,
  device TEXT, chat_id TEXT, thread_id TEXT, agent TEXT NOT NULL, source TEXT NOT NULL, model TEXT, user_message TEXT, final_response TEXT,
  status TEXT NOT NULL DEFAULT 'running', error TEXT);
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, turn_id INTEGER, ts TEXT, kind TEXT NOT NULL, name TEXT, tool_call_id TEXT,
  input TEXT, content TEXT, data TEXT, status TEXT, duration_ms INTEGER, truncated INTEGER NOT NULL DEFAULT 0);`

let db: DatabaseSync
const turn = (o: Record<string, any>) =>
  Number(db.prepare(`INSERT INTO turns (parent_turn_id, started_at, duration_ms, agent, source, user_message, final_response, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(o.parent ?? null, o.at ?? '2026-11-17T10:00:00Z', o.ms ?? 100, o.agent ?? 'default', o.source ?? 'chat',
      o.user ?? 'hi', o.reply ?? 'hello', o.status ?? 'ok', o.error ?? null).lastInsertRowid)
const event = (turnId: number, o: Record<string, any>) =>
  db.prepare(`INSERT INTO events (turn_id, ts, kind, name, input, content, data, status, duration_ms) VALUES (?, 'now', ?, ?, ?, ?, ?, ?, ?)`)
    .run(turnId, o.kind, o.name ?? null, o.input ?? null, o.content ?? null, o.data ?? null, o.status ?? 'ok', o.ms ?? 5)

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)
})

describe('listTurns', () => {
  it('hides sub-agent turns by default, newest first, with counts', () => {
    const a = turn({ user: 'first' })
    const b = turn({ user: 'second' })
    const sub = turn({ parent: b, agent: 'mail', source: 'delegated' })
    event(b, { kind: 'tool', name: 'delegate_to_agent' })
    const r = listTurns(db)
    expect(r.total).toBe(2)
    expect(r.turns.map((t) => t.id)).toEqual([b, a])
    expect(r.turns[0]).toMatchObject({ sub_agent_turns: 1, tool_calls: 1 })
    expect(listTurns(db, { includeDelegated: true }).turns.map((t) => t.id)).toEqual([sub, b, a])
  })

  it('filters by agent, status, source and text (case-insensitive, no wildcards)', () => {
    turn({ agent: 'mail', user: 'Check ACIF mail' })
    turn({ status: 'error', error: 'boom', user: '100% sure' })
    turn({ source: 'scheduled', user: 'other', reply: 'Done' })
    expect(listTurns(db, { agent: 'mail' }).total).toBe(1)
    expect(listTurns(db, { status: 'error' }).total).toBe(1)
    expect(listTurns(db, { source: 'scheduled' }).total).toBe(1)
    expect(listTurns(db, { q: 'acif' }).total).toBe(1)
    expect(listTurns(db, { q: 'done' }).total).toBe(1)
    expect(listTurns(db, { q: '%' }).total).toBe(1) // literal percent only
    expect(listTurns(db, { q: "x'; DROP TABLE turns;--" }).total).toBe(0)
    expect(db.prepare('SELECT count(*) n FROM turns').get()).toEqual({ n: 3 })
  })

  it('paginates, clamps the limit and previews long text', () => {
    for (let i = 0; i < 5; i++) turn({ user: 'x'.repeat(PREVIEW_CHARS + 50) })
    const r = listTurns(db, { limit: 2, offset: 2 })
    expect(r.turns).toHaveLength(2)
    expect(r.total).toBe(5)
    expect(r.turns[0].user_message!.length).toBe(PREVIEW_CHARS + 1)
    expect(listTurns(db, { limit: 99999 }).limit).toBe(MAX_LIMIT)
    expect(listTurns(db, { limit: 'abc' as any }).limit).toBe(50)
  })
})

describe('getTurn', () => {
  it('returns ordered events with parsed JSON and nested sub-agent turns', () => {
    const t = turn({ user: 'q' })
    event(t, { kind: 'model', content: 'calling', data: JSON.stringify({ tool_calls: [{ name: 'echo' }], usage: { input_tokens: 3 } }) })
    event(t, { kind: 'tool', name: 'echo', input: '{"text":"hi"}', content: 'echo:hi' })
    const sub = turn({ parent: t, agent: 'mail', source: 'delegated' })
    event(sub, { kind: 'tool', name: 'yahoo_get_new_emails' })
    const r = getTurn(db, t)!
    expect(r.events.map((e) => e.kind)).toEqual(['model', 'tool'])
    expect(r.events[0].data.tool_calls[0].name).toBe('echo')
    expect(r.events[1].input).toEqual({ text: 'hi' })
    expect(r.children).toHaveLength(1)
    expect(r.children[0]).toMatchObject({ id: sub, agent: 'mail' })
    expect(r.children[0].events[0].name).toBe('yahoo_get_new_emails')
  })
  it('sums tokens per turn and across sub-agent turns', () => {
    const usage = (i: number, o: number) => JSON.stringify({ usage: { input_tokens: i, output_tokens: o } })
    const t = turn({ user: 'q' })
    event(t, { kind: 'model', data: usage(100, 10) })
    event(t, { kind: 'model', data: usage(200, 20) })
    event(t, { kind: 'model', data: JSON.stringify({ tool_calls: [] }) }) // no usage recorded
    const sub = turn({ parent: t, agent: 'mail', source: 'delegated' })
    event(sub, { kind: 'model', data: usage(1000, 5) })
    const r = getTurn(db, t)!
    expect(r.tokens).toEqual({ input_tokens: 300, output_tokens: 30 })
    expect(r.children[0].tokens).toEqual({ input_tokens: 1000, output_tokens: 5 })
    expect(r.tokens_total).toEqual({ input_tokens: 1300, output_tokens: 35 })
    // the list row covers the whole interaction, and sub-agent rows only their own
    const rows = listTurns(db, { includeDelegated: true }).turns
    expect(rows.find((x) => x.id === t)).toMatchObject({ input_tokens: 1300, output_tokens: 35 })
    expect(rows.find((x) => x.id === sub)).toMatchObject({ input_tokens: 1000, output_tokens: 5 })
  })
  it('returns null for an unknown id', () => expect(getTurn(db, 999)).toBeNull())
})

describe('getStats', () => {
  it('aggregates turns, agents, tools and tokens', () => {
    const a = turn({ ms: 100 })
    turn({ ms: 300, status: 'error', agent: 'mail' })
    event(a, { kind: 'tool', name: 'echo', ms: 10 })
    event(a, { kind: 'tool', name: 'echo', ms: 30, status: 'error' })
    event(a, { kind: 'model', data: JSON.stringify({ usage: { input_tokens: 10, output_tokens: 4 } }) })
    const s = getStats(db)
    expect(s.totals).toMatchObject({ turns: 2, errors: 1, avg_duration_ms: 200 })
    expect(s.agents).toHaveLength(2)
    expect(s.tools).toEqual([{ name: 'echo', calls: 2, errors: 1, avg_duration_ms: 20 }])
    expect(s.tokens).toEqual([{ agent: 'default', input_tokens: 10, output_tokens: 4 }])
    expect(s.totals).toMatchObject({ input_tokens: 10, output_tokens: 4 })
  })
  it('ignores rows whose data is truncated (invalid) JSON', () => {
    const a = turn({})
    event(a, { kind: 'model', data: JSON.stringify({ usage: { input_tokens: 10, output_tokens: 4 } }) })
    event(a, { kind: 'model', data: '{"tool_calls":[{"id":"abc","na' })
    expect(getStats(db).tokens).toEqual([{ agent: 'default', input_tokens: 10, output_tokens: 4 }])
    // the totals, the per-turn list and the turn detail must tolerate the bad row too
    expect(getStats(db).totals).toMatchObject({ input_tokens: 10, output_tokens: 4 })
    expect(listTurns(db).turns[0]).toMatchObject({ input_tokens: 10, output_tokens: 4 })
    expect(getTurn(db, a)!.tokens).toEqual({ input_tokens: 10, output_tokens: 4 })
  })
  it('works on an empty database', () => {
    expect(getStats(db).totals.turns).toBe(0)
  })
})

describe('replay columns', () => {
  it('works against an old DB without reasoning_model / replay_of', () => {
    const id = turn({})
    const t = listTurns(db).turns.find((x) => x.id === id)!
    expect(t.reasoning_model).toBeNull()
    expect(t.replay_of).toBeNull()
  })
  it('returns reasoning_model and replay_of when the columns exist', () => {
    db.exec('ALTER TABLE turns ADD COLUMN reasoning_model TEXT; ALTER TABLE turns ADD COLUMN replay_of INTEGER')
    const orig = turn({ user: 'q' })
    const rep = turn({ user: 'q' })
    db.prepare('UPDATE turns SET reasoning_model = ?, replay_of = ? WHERE id = ?').run('LFM3-1.7B', orig, rep)
    const t = listTurns(db).turns.find((x) => x.id === rep)!
    expect(t).toMatchObject({ reasoning_model: 'LFM3-1.7B', replay_of: orig })
  })
})

describe('getSandbox', () => {
  it('returns empty arrays when the sandbox tables do not exist (old DB)', () => {
    expect(getSandbox(db, 1)).toEqual({ files: [], inbox: [], sent: [], messages: [] })
  })
  it('returns files, emails and messages of the turn', () => {
    db.exec(`CREATE TABLE replay_messages (turn_id INTEGER, seq INTEGER, ts TEXT, kind TEXT, text TEXT);
      CREATE TABLE replay_files (turn_id INTEGER, path TEXT, content TEXT, origin TEXT);
      CREATE TABLE replay_emails (turn_id INTEGER, folder TEXT, uid INTEGER, from_addr TEXT, to_addr TEXT, subject TEXT, date TEXT, body TEXT, in_reply_to_uid INTEGER);`)
    db.prepare("INSERT INTO replay_files VALUES (5, 'b.txt', 'B', 'written'), (5, 'a.txt', 'A', 'seeded'), (6, 'z', 'Z', 'seeded')").run()
    db.prepare("INSERT INTO replay_emails VALUES (5, 'inbox', 1, 'x@y', 'me', 'S', 'd', 'body', NULL), (5, 'sent', 1, 'me', 'x@y', 'Re: S', NULL, 'r', 1)").run()
    db.prepare("INSERT INTO replay_messages VALUES (5, 1, 't', 'reply', 'hello')").run()
    const s = getSandbox(db, 5)
    expect(s.files).toEqual([{ path: 'a.txt', content: 'A', origin: 'seeded' }, { path: 'b.txt', content: 'B', origin: 'written' }])
    expect(s.inbox).toEqual([{ uid: 1, from: 'x@y', to: 'me', subject: 'S', date: 'd', body: 'body', inReplyToUid: null }])
    expect(s.sent[0]).toMatchObject({ uid: 1, subject: 'Re: S', inReplyToUid: 1 })
    expect(s.messages).toEqual([{ seq: 1, kind: 'reply', text: 'hello', ts: 't' }])
  })
})
