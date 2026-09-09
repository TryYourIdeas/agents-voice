# Scheduled Task Execution — Design

Date: 2026-09-07
Status: Approved (brainstorm), pending implementation plan

## Purpose

Let the user schedule the agent to run a task — one-off ("remind me in 2 hours") or
recurring ("every Monday at 9am") — and have the result delivered back over WhatsApp,
without the user having to be in an active chat when it fires. Creating a task must be
possible both quickly via a chat command and by hand-editing a file for more complex
cases, and task creation must actively validate/clarify details rather than silently
saving an incomplete or ambiguous task.

## Non-goals

- No enterprise-grade reliability (retry backoff, dead-letter queues, alerting) — this
  is a personal-use bot; simple "retry next poll, log the failure" is enough.
- No web UI for task management — WhatsApp commands and direct file editing only.
- No cross-task dependencies or task chaining.

## Task File Format

New `tasks/` directory (bind-mounted like `memory/`, `session/`, `diagrams/` in
`docker-compose-whatsap.yml`), following the same "individual file + index" convention
already used by `memory/`:

```
tasks/
  index.md               # active tasks: name, description, schedule — one line each
  water-plants-reminder.md
  ...
  archive/
    index.md              # archived tasks: name, description, why archived, when
    old-reminder.md
```

Each active task file (`tasks/<slug>.md`) uses the same frontmatter+body convention as
`agent.md`/`SKILL.md`, parsed with the existing `middleware/frontmatter.ts`:

```markdown
---
name: water-plants-reminder
description: >
  Recurring reminder to water the plants. Output goes to the chat this task
  was created in — sends a short WhatsApp message reminding the user, no
  other action needed.
schedule-type: recurring        # recurring | once
schedule: "0 9 * * MON,THU"     # cron expression (recurring) or ISO datetime (once)
timezone: America/Argentina/Buenos_Aires
target-agent: default           # "default" or a named agent slug (e.g. system-design-coach)
destination-chat: "@jlabrada71" # chat display name the result is sent to
created-by-chat: "@jlabrada71"
status: active                  # active | paused
last-run:                       # ISO timestamp, blank until first fire
---

Remind the user to water the plants. Keep it short and friendly, one message.
```

Field notes:
- `name` is an auto-generated slug (derived from the task description), also used as
  the filename and as the identifier for `@ai cancel task <name>`.
- `description` **must** state where the output goes and what communication should
  happen — the `task-scheduler` agent (below) is required to fill this in and refuses
  to save the task via `create_scheduled_task` until it's present and unambiguous.
- The markdown **body** is the literal instruction sent to the target agent when the
  task fires (same role as an `agent.md` body).
- One-off tasks use `schedule-type: once` with `schedule` as an ISO datetime instead of
  a cron string; on firing they are moved to `tasks/archive/` rather than getting a
  terminal `status` value — status only distinguishes `active`/`paused` for tasks that
  remain in the active directory.
- Cancelling a recurring task (`@ai cancel task <name>`) also moves it to
  `tasks/archive/` — archival, not a status flag, marks "no longer active" for both
  one-off completion and manual cancellation, keeping the active-directory scan cheap
  regardless of history size.

## Components

### `tasks/` directory + `cron-parser` dependency
Storage as described above. `cron-parser` (new npm dependency) computes cron
occurrences; no new dependency needed for one-off (plain `Date` comparison).

### New tools (`tools/`)
Added to `sharedTools` in `shared.ts`, but restricted to the `task-scheduler` agent via
its `allowed-tools` (the default agent and other named agents don't get these):
- `create_scheduled_task` — validates required fields (`description` states
  destination/communication, `schedule`, `target-agent`, `destination-chat` all
  present and unambiguous) before writing the task file and updating `tasks/index.md`;
  returns a validation-failure string (not a thrown error) so the agent can ask a
  follow-up question and retry, same pattern as other tool error returns in this repo.
- `list_scheduled_tasks` — reads `tasks/index.md`.
- `cancel_scheduled_task` — moves a task file to `tasks/archive/`, updates both
  `index.md` files.

### New agent (`agents/task-scheduler/agent.md`)
Same header convention as `story-coach`/`math-coach`/`system-design-coach`
(`name`/`description`/`allowed-tools`/`allowed-skills`). `allowed-tools`: the three
tools above plus `my_read_file`/`list_directory` (no bash, no web/fetch — not needed
for this job). `allowed-skills: cron-scheduling`.

System prompt responsibilities:
- Gather all required fields conversationally; ask one clarifying question at a time
  for anything missing or ambiguous — timing, destination chat, which agent should
  handle the task, and what the delivered message should actually say or do.
- Translate confirmed natural-language timing into a cron expression (or ISO datetime
  for one-off) using the `cron-scheduling` skill's guidance, including timezone
  handling — default to the container's local timezone unless the user names another.
- Only call `create_scheduled_task` once every required field is confirmed and
  unambiguous; if the tool returns a validation failure, relay it back to the user as
  a clarifying question rather than retrying blindly.

### New skill (`skills/cron-scheduling/SKILL.md`)
Cron syntax reference, a table of common natural-language phrases → cron expressions,
timezone-handling notes, and worked examples for both recurring and one-off tasks —
loaded on demand by `task-scheduler` via the existing skill-middleware mechanism.

### New WhatsApp commands (`index.ts`)
Alongside the existing `help`/`clear session`/`list channels`/`list agents`:
- `@ai schedule <text>` → `callNamedAgent("task-scheduler", text, message.from)` — fast
  path for quick task creation.
- `@ai list tasks` → direct read of `tasks/index.md`, no agent call (same pattern as
  `list channels`/`list agents`).
- `@ai cancel task <name>` → direct call into the same archival logic
  `cancel_scheduled_task` uses, no agent call needed since it's a deterministic
  operation.
- `@ai help` text updated to list these.

Free-form chat requests ("remind me every Monday to...") reach `task-scheduler` through
the existing `agentDelegationMiddleware`, which already lists all named agents'
headers to the default agent for delegation — no additional wiring required there.

### New scheduler module (`scheduler.ts`)
Started from `index.ts` right after `client.initialize()`.

- `setInterval` polling every `SCHEDULER_POLL_INTERVAL_MS` (env, default `60000`),
  guarded by an in-progress boolean flag so a slow agent call can't overlap the next
  tick.
- Each tick: list `tasks/*.md` (excluding `index.md`), parse frontmatter for each, and
  for every `status: active` task compute whether it's due:
  - **Recurring**: `cron-parser` computes the most recent scheduled occurrence ≤ now
    in the task's `timezone`; due if that occurrence is newer than `last-run`.
  - **One-off**: due if `now >= schedule`.
- **When due:**
  1. Resolve `destination-chat` (a display name) to a real chat ID, reusing the
     `{name, id}` lookup already built for `list channels`
     (`window.Store.Chat.getModelsArray()`), matched in reverse.
  2. Run the task body: `target-agent === "default" ? callAgent(body, threadId) :
     callNamedAgent(target-agent, body, threadId)`, with
     `threadId = "scheduled:" + task.name` — giving each task its own persistent
     conversation thread across firings, separate from any live chat thread, so a
     recurring task can reference what happened on a prior run if useful.
  3. Send the result to the resolved chat ID, reusing (generalized) diagram-marker-aware
     send logic: `sendAgentResponse` in `index.ts` is refactored to take a `chatId`
     instead of a `message` object (since `message.reply(x)` is just
     `client.sendMessage(message.from, x)`); existing call sites pass `message.from`.
  4. **Recurring**: update `last-run` in the file's frontmatter.
     **One-off**: move the file to `tasks/archive/`, update both `index.md` files.
- **On failure** (agent error, unresolvable chat name): log the error (visible via
  `docker compose logs whatsap`, matching existing `[debug]` logging conventions) and
  leave `last-run`/location untouched so the task is retried on the next poll — no
  dead-letter mechanism, matching the scale of a personal-use bot.

## Data Flow Summary

```
User (chat or file edit)
  → task-scheduler agent validates/clarifies
  → create_scheduled_task writes tasks/<slug>.md + updates tasks/index.md
  → scheduler.ts polls tasks/ every 60s
  → task due?
      → resolve destination-chat → chat ID
      → run target agent (default or named) against the task body
      → send result via client.sendMessage (diagram-marker aware)
      → recurring: update last-run   |   one-off: archive
  → failure: log, retry next poll
```

## Error Handling

- Tool-level validation failures are returned as strings, not thrown, so the
  `task-scheduler` agent can turn them into a clarifying question.
- Scheduler-level failures (agent invocation error, chat resolution failure) are
  logged and retried on the next poll; no task is silently dropped, and no automatic
  backoff/retry-limit is implemented — acceptable at this project's scale.
- `create_scheduled_task` must not write a task file at all until validation passes,
  so there's never a malformed file for the poller to choke on from the creation path.
  Hand-edited files (the "complex task" authoring path) are not validated on load
  beyond frontmatter parsing already tolerating missing fields in this repo's parser;
  a task missing a required field simply won't compute as "due" and will sit inert —
  acceptable since malformed hand-edited files are the user's own responsibility, same
  as a malformed hand-edited `agent.md`.

## Testing / Verification Plan

`whatsap` has no test framework configured (`package.json`'s `test` script is a stub),
consistent with how every other feature in this project has been verified — real
end-to-end checks against the running containers rather than unit tests. Verification
for this feature:
1. Hand-write a one-off task file with a near-future `schedule`; start the stack;
   confirm via `docker compose -f docker-compose-whatsap.yml logs -f whatsap` that it
   fires, the WhatsApp message arrives, and the file moves to `tasks/archive/` with
   both `index.md` files updated.
2. Repeat for a recurring task, confirming `last-run` updates and the task remains
   active for its next occurrence.
3. Exercise `@ai schedule <text>` end-to-end, including a deliberately incomplete
   request, to confirm `task-scheduler` asks a clarifying question rather than saving
   an incomplete task.
4. Exercise `@ai list tasks` and `@ai cancel task <name>` against real task files.
5. Confirm a task targeting a named agent (not `default`) correctly delegates and the
   result is attributed/threaded under `scheduled:<task-name>`.
