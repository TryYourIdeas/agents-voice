# Agent logs (SQLite)

Every user message an agent handles, each model response, each tool execution and the final reply are stored in
`logs/agent-logs.db` (repo root `whatsap-agent/logs/`; in Docker `./logs` is mounted at `/data/logs`).
Purpose: analyse agent answers and improve the agents later. Written by `lib/agent-logs.ts`
(`loggedTurn` around `callAgent`/`callNamedAgent`) and `middleware/agent-logs-middleware.ts`
(attached to the default agent and every named agent). Logging failures never affect the agent.

**Privacy:** contains private chat and email content. `logs/` is git-ignored; do not share the file.

## Config
`AGENT_LOGS_DB` (path; default `../logs/agent-logs.db`), `AGENT_LOGS_ENABLED` (`false` disables),
`AGENT_LOGS_MAX_CHARS` (per-field cap, default 100000; capped rows have `events.truncated = 1`).
Images are never stored, only an `[image <mime>]` placeholder.

## Tables
- `turns`: one row per user message handled by an agent. `agent` (default or named), `source`
  (`chat` | `scheduled` | `delegated`), `user_message`, `final_response`, `status`
  (`ok` | `error` | `recursion_limit`), `error`, `duration_ms`, `device`, `chat_id`, `thread_id`, `model`.
  A sub-agent reached through `delegate_to_agent` is its own turn with `parent_turn_id` set to the delegating turn.
- `events`: ordered by `id` within a `turn_id`. `kind = 'model'`: `content` (reply text) and `data` JSON
  (`tool_calls`, `thinking`, `usage`, `stop_reason`). `kind = 'tool'`: `name`, `input` (args JSON),
  `content` (result), `status`, `duration_ms`. The `delegate_to_agent` tool row holds the sub-agent's reply.

## Example queries
```sql
-- slowest / failed turns
SELECT id, agent, status, duration_ms, substr(user_message,1,80) FROM turns ORDER BY duration_ms DESC LIMIT 20;
SELECT id, agent, error FROM turns WHERE status != 'ok';
-- tool usage and error rate
SELECT name, count(*) calls, sum(status='error') errors, round(avg(duration_ms)) avg_ms FROM events WHERE kind='tool' GROUP BY name;
-- a full conversation trace, with sub-agent turns
SELECT t.id, t.parent_turn_id, t.agent, e.kind, e.name, substr(e.content,1,120) FROM turns t LEFT JOIN events e ON e.turn_id=t.id
WHERE t.id = 42 OR t.parent_turn_id = 42 ORDER BY t.id, e.id;
-- token usage per agent
SELECT t.agent, sum(json_extract(e.data,'$.usage.input_tokens')) in_tok, sum(json_extract(e.data,'$.usage.output_tokens')) out_tok
FROM events e JOIN turns t ON t.id=e.turn_id WHERE e.kind='model' GROUP BY t.agent;
```
Open it with `sqlite3 logs/agent-logs.db` (WAL mode: reading while the bot runs is safe).

## Viewer (UI `/logs`)
The Nuxt app in `ui/` has a read-only viewer at `http://localhost:3000/logs`: summary cards (turns, errors, tokens in/out, tokens by agent, tools),
filters (text, agent, status, source, include sub-agent turns), a paginated turn list (with tokens per turn), and a detail view with every
model step (with its tokens), tool call/result and nested sub-agent turn. API: `GET /api/logs/turns`, `/api/logs/turns/:id`,
`/api/logs/stats` (fixed queries only; no SQL endpoint). The DB path is `NUXT_AGENT_LOGS_DB` / `AGENT_LOGS_DB`
(default `../logs/agent-logs.db`, relative to `ui/`; in `docker-compose.yml` it is `/data/logs/agent-logs.db`).
Local run: `cd ui && npm run dev`. **The UI has no authentication**: anyone who can reach port 3000 can read the
logged chats and emails, so do not expose it beyond your machine/network.
