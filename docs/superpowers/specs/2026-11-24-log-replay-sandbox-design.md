# Log replay in a sandbox, with selectable reasoning models

Date: 2026-11-24 · Status: awaiting approval · Branch: `feat/log-replay-sandbox`

## Intent and why

The owner wants to see how a different reasoning model would have handled an
interaction that already happened. From the logs viewer (`ui/pages/logs.vue`) they pick
a logged turn, choose a model from a list of configured models, and re-run the
interaction's initial message. The run must be harmless: it may not message anyone,
send mail, touch real files or run shell commands. The result is logged like any other
turn and linked back to the original so two models can be compared side by side.

## Goals

1. A **Model configurations** page (list + Add/Edit) holding `name`, `base_url`, `api_key` per configuration.
2. A **Replay** button on every log row opening a replay screen: choose a model configuration, run, watch the result.
3. The replay runs the agent with the chosen model against a **sandbox**: mock messages, mock file system, mock email.
4. The replay screen shows the sandbox: a chat view, a file list + file viewer (one click shows contents), and inbox list, sent list and email viewer.
5. The replay is logged as a normal turn with a **Replay of** link to the original, and **every** log row gets a real **Reasoning Model** field.

## Non-goals / anti-goals

- No replay of multi-message conversations: only the turn's first user message, in a fresh conversation.
- No image or audio replay: logs store `[image ...]` placeholders, never the media.
- Never a real side effect from a replay: a replay that sends a WhatsApp message or an email is a failure even if everything else works.
- Replays do not touch device memory, scheduled tasks or the real pending-mail queue.
- The model-config page is not general settings; no model parameters beyond the three fields.

## Approaches considered

1. **Mock tools in the bot (chosen).** A replay builds its own agent with its own `ChatAnthropic` and a tool list in which every stateful tool is replaced by a mock. Real tools are not in the replay agent at all, so a missed check cannot cause a real send.
2. **Replay flag inside the real tools.** Each real tool checks "am I in a replay?" and diverts. Touches every tool and is one forgotten check from a real side effect. Rejected.
3. **Separate replay service with copies of the tools.** Duplicates the tool code and drifts. Rejected.

Sandbox seed: **rebuilt from the original log** (chosen over a copy of the live device folder/inbox, and over an empty sandbox with a fixtures editor). The original turn's logged tool calls and results seed the mock files and inbox, so a model comparison sees what the original saw and no live private data is copied.

## Design

### Data

`turns` (logs DB, written by the bot) gains, via `ALTER TABLE` guarded by `PRAGMA table_info` at open:
- `replay_of INTEGER REFERENCES turns(id)`
- `reasoning_model TEXT`: the real model name (the configuration's model name for replays; for normal turns the actual model name — see below)

Existing `turns.model` holds the placeholder `ANTHROPIC_MODEL` (`not-necessary` on llama-server), so it cannot be the reasoning model. For normal turns the bot sets `reasoning_model` from a new optional env var `REASONING_MODEL_NAME` (falls back to `LFM3_HF_MODEL`-style label supplied in compose, then to `ANTHROPIC_MODEL`). Old rows show `—`.

New tables, one set per replay turn, written by the bot, read-only in the UI:
- `replay_messages(turn_id, seq, ts, kind /* reply | audio */, text)`
- `replay_files(turn_id, path, content, origin /* seeded | written */)`
- `replay_emails(turn_id, folder /* inbox | sent */, uid, from_addr, to_addr, subject, date, body, in_reply_to_uid)`

Model configurations live in their own SQLite file `logs/model-configs.db` (shared `logs/` volume), table `model_configs(id, name UNIQUE, model, base_url, api_key, created_at, updated_at)`. Written by the UI (Nitro, normal read-write handle), read by the bot by id at replay time. API keys are plain text at rest, like `.env`, never returned to the browser (list/get return `has_key` and a masked tail; Edit leaves the key unchanged when the field is blank).

### Seeding the sandbox from the log

From the original turn's `events` (and its sub-agent turns):
- file tool results (`my_read_file`, `my_list_directory`, `check_*`) → `replay_files` seeded entries (content from reads; listings create empty-path knowledge only where a read exists);
- `yahoo_get_new_emails` results (JSON) → inbox rows;
- anything the original wrote is *not* seeded: the replay agent must write its own.
Seeding is a pure function `seedFromEvents(events) -> {files, emails}`, unit-tested.

### Replay engine (bot, `whatsap/`)

- `lib/replay.ts`: `runReplay({ originalTurnId, modelConfigId })` creates a fresh sandbox, builds a `ChatAnthropic` from the config (`model`, `anthropicApiUrl`=`base_url`, `apiKey`, same temperature/maxTokens/streaming as `shared.ts`), builds the replay agent, runs it inside `loggedTurn` with `replay_of` and `reasoning_model` set, and records sandbox state.
- `tools/replay/*.ts`: mock versions of `my_read_file`, `my_write_file`, `my_list_directory`, `check_directory_exists`, `create_directory`, `download_file` (writes a placeholder file), `send_audio` (message of kind `audio`), `yahoo_get_new_emails` (sandbox inbox), `yahoo_draft_email` (appends to the sandbox sent list; there is no human to confirm, so it records the draft as sent in the sandbox), `render_diagram` (stores nothing real), scheduled-task tools (return "disabled in replay"). Read-only network tools `web_search` and `fetch_url` are the real ones. `execute_bash` is excluded.
- The agent's final reply is stored as the sandbox chat message instead of being sent through `bot.ts`.
- Middleware kept: logging, tool budget, tool-error handling, fetch guard. Memory/skill/delegation middleware kept; delegated sub-agents get the same replay model and sandbox.
- `internal-api.ts`: `POST /api/replay` `{ turnId, modelConfigId }` → starts the run, returns `{ replayTurnId }` immediately; the run continues in the background and the UI polls the turn/sandbox until `status != running`.

### UI (`ui/`)

- `pages/models/index.vue` — configurations list with Add/Edit (modal or inline form), API key masked.
- `server/api/model-configs*` — CRUD (read-write DB handle separate from the read-only logs handle); no key ever in a response.
- `pages/logs.vue` — new columns **Reasoning Model** and **Replay of** (link to the original), a **Replay** button per row.
- `pages/replay/[turnId].vue` — pick a model configuration, Run, then show the live sandbox plus the turn's final reply/status/tokens.
- `server/api/replay.post.ts` — thin proxy to the bot's `/api/replay`; `server/api/logs/turns/[id]/sandbox.get.ts` — reads the three sandbox tables read-only.
- Components (reusable, props/slots only, styled by shared tokens, per the repo's `lib/ui-lib` rule — designed for inclusion there, kept in `ui/components` until a second consumer exists, noted in the changelog):
  - `MockChat` — message list.
  - `MockFileList`, `MockFileView` — list emits `select`, view shows content (and an empty state).
  - `MockInboxList`, `MockSentList`, `MockEmailView` — lists emit `select`, view shows one email.
- Tests: vitest + testing-library (accessibility) per component; vitest for server utils; Playwright script for the model-config, replay and logs flow.

### Logging, config, docs

- Replay start/finish, seed counts, blocked tools and model-config id (never the key) are logged; extra tracing under `NUXT_ADD_DEBUG_LOGS` in the UI.
- New env: `REASONING_MODEL_NAME` (bot, in `.env.whatsap-llama`/compose), `NUXT_MODEL_CONFIGS_DB` (UI).
- Update `docs/user-guides/{config,features,manual}.md`, `whatsap/docs/agent-logs.md` (schema), `docs/changes.md`, and add an ADR in `docs/architecture/next/adrs`.

## Constraints

- The UI cannot write the logs DB (read-only handle by design) and has no agent; all execution is in the bot.
- API keys must not reach the browser or the logs.
- Logging must never break the agent (existing rule in `agent-logs.ts`).
- Truncated logs: seeds and replays work from capped text; replays can differ for that reason.

## My calls (not agreed in conversation; please check)

- Reasoning model name for normal turns comes from `REASONING_MODEL_NAME`.
- `yahoo_draft_email` in a replay records straight into the sandbox sent list.
- Delegated sub-agents in a replay use the same replay model and sandbox.
- Replay runs in the background; the UI polls rather than streams.
- Model-config key stored in plain text in SQLite.
- Components stay in `ui/components` for now, built to move into `lib/ui-lib` unchanged.

## Left to the builder

Table indexes, exact column widths and layout of the replay screen, polling interval, the seeding heuristics for ambiguous tool results, error states (bad base_url, unreachable model).
