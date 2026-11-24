import { DatabaseSync } from 'node:sqlite'
import { createServer, type Server } from 'node:http'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { E2E_DIR, STUB_BOT_PORT } from '../../playwright.config'

// Same tables as whatsap/lib/agent-logs.ts (only the columns the UI reads).
const SCHEMA = `
CREATE TABLE turns (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_turn_id INTEGER, started_at TEXT, ended_at TEXT, duration_ms INTEGER,
  device TEXT, chat_id TEXT, thread_id TEXT, agent TEXT NOT NULL, source TEXT NOT NULL, model TEXT, user_message TEXT, final_response TEXT,
  status TEXT NOT NULL DEFAULT 'running', error TEXT, replay_of INTEGER, reasoning_model TEXT);
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, turn_id INTEGER, ts TEXT, kind TEXT NOT NULL, name TEXT, tool_call_id TEXT,
  input TEXT, content TEXT, data TEXT, status TEXT, duration_ms INTEGER, truncated INTEGER NOT NULL DEFAULT 0);
CREATE TABLE replay_messages (turn_id INTEGER, seq INTEGER, ts TEXT, kind TEXT, text TEXT);
CREATE TABLE replay_files (turn_id INTEGER, path TEXT, content TEXT, origin TEXT);
CREATE TABLE replay_emails (turn_id INTEGER, folder TEXT, uid INTEGER, from_addr TEXT, to_addr TEXT, subject TEXT, date TEXT, body TEXT, in_reply_to_uid INTEGER);`

let server: Server | undefined

export default async function globalSetup() {
  rmSync(E2E_DIR, { recursive: true, force: true })
  mkdirSync(E2E_DIR, { recursive: true })
  const logs = new DatabaseSync(path.join(E2E_DIR, 'agent-logs.db'))
  logs.exec('PRAGMA journal_mode = WAL;')
  logs.exec(SCHEMA)
  logs.prepare(`INSERT INTO turns (started_at, device, agent, source, user_message, final_response, status, reasoning_model)
    VALUES ('2026-11-24T10:00:00Z', 'primary', 'default', 'chat', 'summarize my mail', 'You have one invoice.', 'ok', 'LFM3-1.7B')`).run()
  logs.close()

  // Stub of the bot's POST /api/replay: records a finished replay turn with a canned sandbox.
  server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/replay') { res.writeHead(404).end(); return }
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const { turnId, modelConfigId } = JSON.parse(raw)
      const cfg = new DatabaseSync(path.join(E2E_DIR, 'model-configs.db'), { readOnly: true })
      const model = (cfg.prepare('SELECT model FROM model_configs WHERE id = ?').get(modelConfigId) as any)?.model
      cfg.close()
      if (!model) { res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: `Model configuration ${modelConfigId} not found.` })); return }
      const db = new DatabaseSync(path.join(E2E_DIR, 'agent-logs.db'))
      db.exec('PRAGMA busy_timeout = 5000')
      const id = Number(db.prepare(`INSERT INTO turns (started_at, device, agent, source, user_message, final_response, status, reasoning_model, replay_of)
        VALUES ('2026-11-24T11:00:00Z', 'primary', 'default', 'chat', 'summarize my mail', 'Here is your summary', 'ok', ?, ?)`).run(model, turnId).lastInsertRowid)
      db.prepare("INSERT INTO replay_messages VALUES (?, 1, 't', 'reply', 'Here is your summary')").run(id)
      db.prepare("INSERT INTO replay_files VALUES (?, 'notes/todo.txt', 'buy milk', 'seeded')").run(id)
      db.prepare("INSERT INTO replay_emails VALUES (?, 'inbox', 1, 'ann@example.com', 'me@example.com', 'Invoice 42', NULL, 'Please pay invoice 42.', NULL)").run(id)
      db.prepare("INSERT INTO replay_emails VALUES (?, 'sent', 1, 'me@example.com', 'ann@example.com', 'Re: Invoice 42', NULL, 'Paid, thanks.', 1)").run(id)
      db.close()
      res.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify({ replayTurnId: id }))
    })
  })
  await new Promise<void>((r) => server!.listen(STUB_BOT_PORT, '127.0.0.1', r))
  return async () => { await new Promise((r) => server?.close(r)) }
}
