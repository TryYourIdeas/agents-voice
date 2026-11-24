# Log Replay in a Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner re-run a logged turn's first message against a chosen model configuration inside a sandbox (mock chat, files, email), shown in the logs UI and logged with a "Replay of" link and a real "Reasoning Model" field.

**Architecture:** The bot (`whatsap/`) builds a per-replay `ChatAnthropic` and an agent whose tool list has mock versions of every stateful tool, seeded from the original turn's logged tool results; sandbox state is persisted in the logs SQLite DB. The UI (`ui/`, Nuxt, read-only logs handle) owns model-config CRUD in a separate SQLite file, proxies "start replay" to the bot's internal API, and renders the sandbox with six reusable components.

**Tech Stack:** Node `node:sqlite`, LangChain `createAgent`/`@langchain/anthropic`, vitest (bot and UI), Nuxt 3 / Vue 3 / TS, `@testing-library/vue`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-log-replay-sandbox-design.md`

## Global Constraints

- Branch `feat/log-replay-sandbox`; commit prefixes `feat:`, `bugfix:`, `refactor:`, `config:`, `docs:`; end commits with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Push the branch, never open the PR, never touch `main`.
- A replay agent must contain **no real** file, email, chat, audio, bash or scheduled-task tool. `web_search` and `fetch_url` stay real.
- API keys are never returned to the browser, never logged, never in `events`.
- Logging must never break the agent (`safe()` wrapper rule in `whatsap/lib/agent-logs.ts`).
- UI never writes the agent logs DB; model configs live in `logs/model-configs.db` (env `NUXT_MODEL_CONFIGS_DB`).
- Env params go in `.env` files/compose: bot `REASONING_MODEL_NAME`, UI `NUXT_MODEL_CONFIGS_DB`; tracing under `NUXT_ADD_DEBUG_LOGS`.
- Reusable UI: components take props/slots, no store/route/API coupling, styled by existing tokens.
- Replays are text-only, fresh conversation, first user message only.

## Review Focus

- Original turn has no tool events (or truncated/invalid JSON in `data`/`content`): seeding yields an empty sandbox, no throw.
- Model config with unreachable `base_url` or wrong key: replay turn ends `status='error'` with a readable message; the UI shows it and stops polling.
- Agent tries `../` or absolute paths in the mock file system: rejected, never touches the real disk.
- Two replays of the same turn at once, and a replay of a replay: sandboxes are isolated by turn id; replay of a replay uses the replay's own `user_message`.
- Editing a config leaving the key blank keeps the old key; deleting a config in use does not break existing logs (`reasoning_model` is stored by name, not id).

---

### Task 1: Log schema — replay link and reasoning model

**Files:**
- Modify: `whatsap/lib/agent-logs.ts` (SCHEMA, `TurnMeta`, `recordTurn` INSERT)
- Modify: `whatsap/agent.ts:69`, `whatsap/named-agents.ts:179` (pass `reasoningModel`)
- Test: `whatsap/lib/agent-logs.test.ts`

**Interfaces:**
- Produces: `TurnMeta.replayOf?: number`, `TurnMeta.reasoningModel?: string`; `export function reasoningModelName(env = process.env): string` (= `REASONING_MODEL_NAME || ANTHROPIC_MODEL`); `export function openLogsDb()` now guarantees columns `turns.replay_of`, `turns.reasoning_model` and tables `replay_messages`, `replay_files`, `replay_emails` exactly as in the spec's Data section.

- [ ] **Step 1: Failing tests** in `agent-logs.test.ts`: `migrates an existing DB without replay columns` (create DB with the old `turns` DDL, call `openLogsDb`, assert `PRAGMA table_info(turns)` lists both columns); `stores reasoning_model and replay_of` (run `loggedTurn({... reasoningModel:"m1", replayOf: 7})`, select the row); `reasoningModelName prefers REASONING_MODEL_NAME`.
- [ ] **Step 2: Run** `cd whatsap && npx vitest run lib/agent-logs.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Add the tables to `SCHEMA`; after `d.exec(SCHEMA)` run a guarded `ALTER TABLE turns ADD COLUMN` for each missing column (check `PRAGMA table_info`). Extend the turn INSERT. Default `reasoningModel` to `reasoningModelName()` in `recordTurn`.
- [ ] **Step 4: Run** the same command plus `npx vitest run` — expect PASS.
- [ ] **Step 5: Commit** `feat: log reasoning model and replay link on turns`.

### Task 2: Sandbox store and log seeding

**Files:**
- Create: `whatsap/lib/replay/sandbox.ts`, `whatsap/lib/replay/seed.ts`
- Test: `whatsap/lib/replay/sandbox.test.ts`, `whatsap/lib/replay/seed.test.ts`

**Interfaces:**
- Consumes: Task 1 tables.
- Produces:
  - `interface SandboxEmail { uid:number; from:string; to:string; subject:string; date?:string; body:string; inReplyToUid?:number }`
  - `class Sandbox { files: Map<string,string>; inbox: SandboxEmail[]; sent: SandboxEmail[]; messages: {kind:"reply"|"audio"; text:string; ts:string}[]; normalizePath(p:string): string; persist(turnId:number): void }` — `normalizePath` throws on absolute paths and any `..` segment; paths are `/`-separated, no leading `./`.
  - `seedFromEvents(events: {kind:string; name:string|null; input:string|null; content:string|null; status:string|null}[]): { files: Map<string,string>; inbox: SandboxEmail[] }`

- [ ] **Step 1: Failing tests.** `sandbox.test.ts`: `normalizePath rejects ../x and /etc/passwd`, `persist writes rows to replay_files/replay_emails/replay_messages for the turn id` (in-memory DB via `openLogsDb(":memory:")`). `seed.test.ts`: `seeds a file from a my_read_file event`, `seeds inbox from a yahoo_get_new_emails JSON result`, `ignores my_write_file events`, `ignores errored events and unparsable JSON`, `empty events give empty sandbox`.
- [ ] **Step 2: Run** `npx vitest run lib/replay` — FAIL.
- [ ] **Step 3: Implement** both files. `seedFromEvents` reads `input` JSON `file_path` and uses `content` as file text (skip `[truncated` tails only by keeping what is there); emails parsed from the tool's pretty-printed JSON array, mapping `EmailSummary` fields (`uid, from, to, subject, date, body`). `persist` is wrapped in `safe`-style try/catch.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: replay sandbox store and log seeding`.

### Task 3: Mock tools

**Files:**
- Create: `whatsap/tools/replay/index.ts` (and one file per group if >150 lines)
- Test: `whatsap/tools/replay/replay-tools.test.ts`

**Interfaces:**
- Consumes: `Sandbox` (Task 2).
- Produces: `createReplayTools(sandbox: Sandbox, real: { webSearch: StructuredTool; fetchUrl: StructuredTool }): StructuredTool[]` — tool names identical to the real ones so prompts keep working: `my_read_file`, `my_write_file`, `my_list_directory`, `check_directory_exists`, `create_directory`, `download_file`, `send_audio`, `yahoo_get_new_emails`, `yahoo_draft_email`, `render_diagram`, `create_scheduled_task`, `list_scheduled_tasks`, `cancel_scheduled_task`, plus the two real network tools. `get_current_chat`/`get_current_datetime` keep their real versions (read-only). Read the real tool files for exact names and schemas and reuse their zod schemas.

- [ ] **Step 1: Failing tests:** `write then read returns content`, `read of missing file returns an error string`, `list_directory lists seeded and written files under a dir`, `../ path is rejected and nothing on disk changes` (assert `fs` untouched), `yahoo_get_new_emails returns inbox and "No new (unread) emails." when empty`, `yahoo_draft_email appends to sent and returns a "sent (sandbox)" notice`, `send_audio appends an audio message`, `scheduled-task tools answer "disabled in replay"`, `tool list contains no execute_bash`.
- [ ] **Step 2: Run** `npx vitest run tools/replay` — FAIL.
- [ ] **Step 3: Implement** each mock via `tool(fn, {name, description, schema})` operating on `sandbox`. Reply text for read errors matches the real tool's wording where it exists.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: mock tools for replay sandbox`.

### Task 4: Replay engine and internal API

**Files:**
- Create: `whatsap/lib/model-configs.ts`, `whatsap/lib/replay/run.ts`
- Modify: `whatsap/agent.ts` and `whatsap/named-agents.ts` (extract agent factories taking `{model, tools}` overrides, no behaviour change), `whatsap/internal-api.ts` (new route)
- Test: `whatsap/lib/model-configs.test.ts`, `whatsap/lib/replay/run.test.ts`, `whatsap/internal-api.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `getModelConfig(id: number, file?: string): { id:number; name:string; model:string; baseUrl:string; apiKey:string } | undefined` (reads `logs/model-configs.db`, table per spec; file path from `MODEL_CONFIGS_DB` env, default `../logs/model-configs.db`).
  - `startReplay(args: { originalTurnId:number; modelConfigId:number }, deps?: { invoke?: (agent, message) => Promise<string> }): Promise<{ replayTurnId:number }>` — validates both ids (throws `ReplayError` with `.status` 404/400), creates the replay turn row synchronously (so the id can be returned), then runs the agent in the background inside `loggedTurn` with `replayOf`, `reasoningModel = config.model`, agent/device from the original, `source` stays `chat`; seeds the sandbox from the original turn tree's events; stores the final reply as a sandbox `reply` message; calls `sandbox.persist` in a `finally`. Never logs the key.
  - `POST /api/replay` body `{turnId, modelConfigId}` → `202 {replayTurnId}`; `400/404` with `{error}`.

- [ ] **Step 1: Failing tests.** `run.test.ts` with a fake `invoke`: `creates a turn with replay_of and reasoning_model`, `uses the original user_message`, `seeds sandbox from original events`, `persists the final reply as a sandbox message`, `unreachable model marks the turn error` (invoke throws), `unknown turn → ReplayError 404`, `unknown config → 404`. `model-configs.test.ts`: `returns undefined for a missing id`. `internal-api.test.ts`: `POST /api/replay returns 202 and replayTurnId`, `404 for unknown turn`.
- [ ] **Step 2: Run** `npx vitest run lib/replay lib/model-configs.test.ts internal-api.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Factory extraction first (`refactor:` commit separately, existing tests must stay green). Replay model: `new ChatAnthropic({ model: cfg.model, anthropicApiUrl: cfg.baseUrl, apiKey: cfg.apiKey, temperature: 0, maxRetries: 2, maxTokens, streaming: true })` mirroring `shared.ts`. Replay agent uses a fresh `MemorySaver` and thread id `device:<device>:replay-<replayTurnId>`; keep logging, tool-budget, tool-error, fetch-guard, datetime, skill middleware; drop vision routing and `agentDelegationMiddleware`'s real delegation only if it cannot take the replay model — otherwise pass the replay model and tools through (spec: delegates use the same model and sandbox).
- [ ] **Step 4: Run** the three files plus full `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `refactor: agent factories take model and tools` then `feat: replay engine and /api/replay`.

### Task 5: UI model configurations

**Files:**
- Create: `ui/server/utils/model-configs-db.ts`, `ui/server/api/model-configs.get.ts`, `model-configs.post.ts`, `model-configs/[id].put.ts`, `model-configs/[id].delete.ts`, `ui/pages/models/index.vue`
- Modify: `ui/nuxt.config.ts` (`modelConfigsDb: process.env.MODEL_CONFIGS_DB || '../logs/model-configs.db'`), `ui/pages/index.vue` (link)
- Test: `ui/tests/model-configs-db.test.ts`, `ui/tests/models-page.test.ts`

**Interfaces:**
- Produces: `listConfigs(db): {id,name,model,base_url,has_key:boolean,key_tail:string}[]`; `createConfig(db,{name,model,base_url,api_key})`; `updateConfig(db,id,{name,model,base_url,api_key?})` (blank/undefined `api_key` keeps the stored key); `deleteConfig(db,id)`; `openConfigsDb(path)` creates the file/table (read-write). Validation: non-empty `name` (unique), `model`, `base_url` parses as http(s) URL → 400 otherwise.

- [ ] **Step 1: Failing tests:** `list never exposes api_key`, `key_tail shows last 4 chars only`, `update with blank key keeps old key`, `duplicate name rejected`, `invalid base_url rejected`; page test (testing-library): `lists configs`, `Add opens form and submits`, `Edit prefills with blank key field`, form controls have accessible labels.
- [ ] **Step 2: Run** `cd ui && npx vitest run tests/model-configs-db.test.ts tests/models-page.test.ts` — FAIL.
- [ ] **Step 3: Implement** utils, handlers (thin; log id/name/outcome under `NUXT_ADD_DEBUG_LOGS`, never the key) and the page (inline form, Add/Edit buttons, delete with confirm).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: model configurations page and API`.

### Task 6: Logs list shows Reasoning Model, Replay of, Replay button; sandbox read API

**Files:**
- Modify: `ui/server/utils/agent-logs-db.ts` (`listTurns` selects `t.reasoning_model, t.replay_of`; add `getSandbox`), `ui/pages/logs.vue`, `ui/components/LogTurn.vue`
- Create: `ui/server/api/logs/turns/[id]/sandbox.get.ts`
- Test: `ui/tests/agent-logs-db.test.ts`, `ui/tests/logs-page.test.ts`

**Interfaces:**
- Produces: `getSandbox(db, turnId): { files:{path:string;content:string;origin:string}[]; inbox:SandboxEmail[]; sent:SandboxEmail[]; messages:{seq:number;kind:string;text:string;ts:string}[] }`. Must tolerate DBs without the new columns/tables (old logs): reasoning model `null`, empty sandbox.

- [ ] **Step 1: Failing tests:** `listTurns returns reasoning_model and replay_of`, `works against an old DB without those columns`, `getSandbox returns rows and empty arrays`, page: `renders Reasoning Model column`, `shows "Replay of #N" link opening the original`, `Replay button links to /replay/<id>`.
- [ ] **Step 2: Run** the two test files — FAIL.
- [ ] **Step 3: Implement.** For old DBs check `PRAGMA table_info` once per handle and select `NULL AS reasoning_model` when absent.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: reasoning model and replay link in logs viewer`.

### Task 7: Sandbox components

**Files:**
- Create: `ui/components/MockChat.vue`, `MockFileList.vue`, `MockFileView.vue`, `MockInboxList.vue`, `MockSentList.vue`, `MockEmailView.vue`
- Test: `ui/tests/mock-components.test.ts`

**Interfaces (props → emits):**
- `MockChat`: `messages: {kind:string;text:string;ts?:string}[]`
- `MockFileList`: `files: {path:string}[]`, `selected?: string` → `select(path)`
- `MockFileView`: `file?: {path:string;content:string}` (empty state when undefined)
- `MockInboxList` / `MockSentList`: `emails: SandboxEmail[]`, `selectedUid?: number` → `select(uid)`
- `MockEmailView`: `email?: SandboxEmail` (empty state when undefined)

- [ ] **Step 1: Failing tests** (testing-library): per component `renders items`, `emits select on click and on Enter/Space` (items are real `<button>`s), `empty state text`, `selected item has aria-current`, file content shown in a `<pre>` and is not interpreted as HTML (assert `<script>` text is literal), email body likewise.
- [ ] **Step 2: Run** `npx vitest run tests/mock-components.test.ts` — FAIL.
- [ ] **Step 3: Implement** the six SFCs, props/slots only, existing tokens.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: reusable mock sandbox components`.

### Task 8: Replay screen

**Files:**
- Create: `ui/pages/replay/[turnId].vue`, `ui/server/api/replay.post.ts`
- Test: `ui/tests/replay-page.test.ts`, `ui/tests/replay-api.test.ts`

**Interfaces:**
- Consumes: Tasks 5–7. `POST /api/replay {turnId, modelConfigId}` proxies to `${whatsapApiUrl}/api/replay`, passing status/body through (no key involved). Page polls `/api/logs/turns/<replayTurnId>` and `/sandbox` every 1500 ms until status ≠ `running`, with an upper bound of 10 min.

- [ ] **Step 1: Failing tests:** page shows original message, config `<select>` (empty-state link to `/models` when none), Run disabled until chosen; after run shows `MockChat`, file list/view (click shows content), inbox/sent/email view; error status shows the error text and stops polling; handler passes through 404.
- [ ] **Step 2: Run** `npx vitest run tests/replay-page.test.ts tests/replay-api.test.ts` — FAIL.
- [ ] **Step 3: Implement** page (two-column on wide screens, stacked on narrow) and proxy handler.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: replay screen with sandbox viewers`.

### Task 9: Config, docs, ADR, e2e

**Files:**
- Modify: `.env.whatsap-llama` example/`whatsap/env.example` (`REASONING_MODEL_NAME`), compose `whatsap-lfm3-stt-tts-vision-kokoro-docker-compose.yml` (UI env `NUXT_MODEL_CONFIGS_DB`, bot `MODEL_CONFIGS_DB`, shared `logs/` mount for both), `docs/user-guides/{config,features,manual}.md`, `whatsap/docs/agent-logs.md`, `docs/changes.md`, `docs/index.md`
- Create: `docs/architecture/next/adrs/ADR-log-replay-sandbox.md`, `ui/tests/e2e/replay.spec.ts` (Playwright)

- [ ] **Step 1: Update config and docs** (manual includes a mermaid sequence diagram: UI → bot → model → sandbox tables → UI polling).
- [ ] **Step 2: Playwright script:** add a config, open Logs, click Replay, pick the config against a stubbed bot endpoint, assert chat message, click a file and see content, open an email.
- [ ] **Step 3: Run** all: `cd whatsap && npx vitest run`; `cd ui && npx vitest run`; run the Playwright script.
- [ ] **Step 4: Verify** `git status -- ui/.output` is clean; commit `docs: replay sandbox docs and config`; push `git push -u github feat/log-replay-sandbox`; give the compare URL.
