# Multi-Device WhatsApp Support — Design

Date: 2026-09-08
Status: Approved (brainstorm), pending implementation plan

## Purpose

Support multiple WhatsApp phone numbers/devices from this one bot, without
duplicating the expensive shared backend services (`llama-server`, `stt`,
`plantuml-renderer`) per device — only the lightweight per-device pieces
(a `whatsapp-web.js` `Client`/Chromium instance, its session, its own tasks
and memory) should multiply. Device linking (QR scanning) should be
decoupled from the terminal — currently `qrcode-terminal` only works for a
single device during an interactive `docker compose run`, which doesn't
scale to N devices and doesn't support onboarding a device without direct
terminal access.

## Non-goals

- No change to the shared backend services themselves (`llama-server`,
  `stt`, `plantuml-renderer` stay single-instance, shared across devices).
- No authentication/access-control layer on the new Nuxt UI in this design
  — it's assumed to run on a trusted internal network, same trust model as
  every other service in this stack today. Worth revisiting if that
  assumption changes.
- No hot-reload for hand-edited `devices/<name>/device.md` status changes
  (e.g. flipping `active` to `paused`) beyond what the periodic reconcile
  pass naturally provides — not building a live file-watcher for every
  field, just for new-device pickup (see Design, Device Onboarding).

## Requirements (from brainstorm)

1. One device config file per device, following this project's existing
   per-item-file convention (`agents/<name>/agent.md`,
   `tasks/<name>.md`, etc.).
2. Each device gets its own scheduled tasks, isolated from other devices'
   — not just its own `destination-chat` disambiguation, a fully separate
   `tasks/` subtree per device.
3. Each device gets its own general-purpose memory (`memory/` — cross-session
   facts, distinct from per-task continuity notes) — not shared across
   devices.
4. Device linking (QR code) happens through a web UI, decoupled from the
   terminal, built with Nuxt (matching this user's standing frontend
   preference and the pattern already used by the root repo's `ui/` app).
5. Adding a new device must not require restarting the `whatsap` container.

## Design

### 1. Device Config & Directory Layout

New `devices/<device-name>/device.md`:

```markdown
---
name: personal
label: Personal Number
status: active
---

Primary WhatsApp account.
```

- `name` doubles as the `LocalAuth` `clientId` and the directory-name
  identifier — same `NAME_RE` path-traversal-safe validation pattern
  already used by `lib/tasks.ts`.
- `label` is for display only (UI, logs).
- `status: active | paused` — a paused device's `Client` is never started.
- Each device owns a full subtree:

```
devices/<name>/
  device.md
  session/          (LocalAuth session — was top-level session/)
  memory/           (general-purpose memory — was top-level memory/)
  tasks/
    index.md
    <task>.md
    archive/
      index.md
      <task>.md
    memory/         (per-task continuity notes — tasks/memory/<task>.md today)
```

- **Migration**: the current single device becomes `devices/primary/`, with
  today's `session/`, `memory/`, and `tasks/` moved under it — the first
  task of the implementation plan.

**Architectural consequence**: `memory-middleware.ts` currently hardcodes a
single `memory/index.md` path, and both the default agent (`agent.ts`) and
every named agent (`named-agents.ts`) are built **once** as shared
singletons at module load, reused across every conversation regardless of
device. Per-device memory means that no longer works — agents become
**per-device instances**. This project already has the exact pattern for
this: `createSkillMiddleware(extraDirs, allowedSkills)` is already a
factory, not a singleton, used precisely so each named agent gets its own
scoped skill set. `memory-middleware.ts` gets the same treatment
(`createMemoryMiddleware(deviceMemoryDir)`), `named-agents.ts`'s
`getNamedAgent(agentName)` cache becomes keyed by `(deviceName, agentName)`,
and `agent.ts`'s single exported `agent` becomes `getDefaultAgent(deviceName)`
cached the same way.

### 2. Multi-Client Refactor & Device-Aware Thread IDs

**New `lib/devices.ts`** (same shape as `lib/tasks.ts`): `listDeviceNames()`,
`readDevice(name)`, parsed via the existing `middleware/frontmatter.ts`.

**`index.ts` splits in two.** Today's single top-level `client` construction
and its one `MESSAGE` handler (containing all `@ai` dispatch logic) moves
into a new `bot.ts`:

```ts
export function createDeviceBot(device: DeviceConfig): Client {
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: device.name, dataPath: `devices/${device.name}/session` }),
        puppeteer: { /* unchanged */ },
    });
    setWhatsAppClient(device.name, client);
    client.on('qr', (qr) => setDeviceStatus(device.name, { state: 'pending', qr }));
    client.on('ready', () => setDeviceStatus(device.name, { state: 'connected' }));
    client.on('disconnected', () => setDeviceStatus(device.name, { state: 'disconnected' }));
    client.on(MESSAGE, (message) => handleMessage(client, device.name, message)); // today's @ai logic, unchanged in substance
    client.initialize();
    return client;
}
```

`index.ts` becomes a thin orchestrator: run device onboarding pickup (see
below), then `listDeviceNames().map(readDevice).filter(active).forEach(createDeviceBot)`,
start the scheduler with the live device list, start the internal API
server (Design §4).

**One consistent thread-id convention**, applied once at the outermost
point (`bot.ts`'s message handler, `scheduler.ts`'s `fireTask`) and left
otherwise unchanged everywhere else — every thread id gets a `device:<name>:`
prefix wrapped around today's existing scheme:

- default agent, live chat: `device:<name>:<chatId>`
- named agent, live chat: `device:<name>:agent:<agentName>:<chatId>`
  (`named-agents.ts` still does its own `agent:<agentName>:` wrapping around
  whatever threadId it's given — unchanged)
- scheduled task: `device:<name>:scheduled:<taskName>:<timestamp>`

This is deliberately minimal-diff: `agent.ts`, `named-agents.ts`, and
`agent-delegation-middleware.ts` don't change at all, since they only pass
an opaque threadId string through. Only the places that need to *act* on
device identity — `tools/get-current-chat.tool.ts`, the three scheduled-task
tools, and `scheduler.ts` — parse the `device:<name>:` prefix back off.
`lib/whatsapp-client.ts`'s registry becomes a `Map<deviceName, Client>`.
Thread ids are globally unique across devices by construction, so the
single shared `MemorySaver` in `shared.ts` is untouched — no per-device
checkpointers needed.

### 3. Per-Device `tasks/` and `scheduler.ts`

**`lib/tasks.ts`** gains a `device: string` as the first parameter on every
function; its path constants become functions (`tasksDir(device)`,
`archiveDir(device)`, `taskMemoryDir(device)`). Everything else about the
module — frontmatter format, `index.md` regeneration, archival, `slugify`
— is unchanged, only *where* it reads/writes moves.

**`scheduler.ts`**'s `startScheduler` takes the full device list instead of
a single client:

```ts
export function startScheduler(devices: { name: string; client: any }[]): void {
    setInterval(() => devices.forEach((d) => void pollOnce(d.name, d.client)), POLL_INTERVAL_MS);
}
```

`pollOnce`/`fireTask` gain a leading `deviceName` param, threaded into
`listActiveTaskNames(deviceName)` etc. and into the thread id
(`device:${deviceName}:scheduled:${task.name}:${Date.now()}`). Each device
polls and fires independently — one device's stuck/erroring task never
blocks another device's.

**The three scheduling tools** (`create_scheduled_task`, `list_scheduled_tasks`,
`cancel_scheduled_task`) and `get_current_chat` already take `config` as
their second argument (that's how `get_current_chat` reads `thread_id`
today). They gain the same one-line pattern: parse `device:<name>:` off
`config.configurable.thread_id` to know which device's `tasks/` directory
(or client, for `get_current_chat`) to operate on — no new plumbing, since
`config` was already available at the call site.

`task-scheduler`'s own agent instance becomes per-device too, per §1's
memory consequence extended to every agent (its tools now need to act on
the right device's `tasks/`, not just the right device's memory).

### 4. Device Onboarding (no restart required)

Devices work the same way `tasks/` already does — a directory the running
process polls fresh, not a fixed array built once at startup.

New `new-devices/<name>.md` — flat file (no subdirectories yet, nothing has
started for it), just `name`/`label`:

```markdown
---
name: business
label: Business Line
---
```

A lightweight poller (own interval, e.g. every 5s — snappier than the
scheduler's 60s tick, since someone is actively waiting to scan a QR) checks
`new-devices/` each tick. For anything found, it:

1. Parses the file.
2. Calls `createDeviceBot()` for it.
3. Adds it to the running scheduler's live device list.
4. Creates the full `devices/<name>/` subtree (`device.md` + `session/` +
   `tasks/` + `memory/`).
5. Deletes `new-devices/<name>.md`.

On container startup, this same pickup pass runs once **before** the normal
`devices/*/device.md` startup loop, so anything left over from a prior
restart (e.g. a device created right before a deploy) is picked up the same
way. Both paths — UI-driven creation and manual file-drop — converge on the
identical `createDeviceBot()` call, so there's exactly one "how a device
comes to life" code path.

`whatsap`'s internal API (§5) never mutates anything — devices are always
created by writing to `new-devices/` (whether by the Nuxt UI's Nitro server
writing directly to the shared volume, or by hand), never through an API
call to `whatsap` itself.

### 5. Internal API (`whatsap` → Nuxt UI)

Small, **read-only** JSON+image API added to `index.ts`'s orchestrator,
served via Node's built-in `http` module (no new dependency for a handful
of routes). Bound to `0.0.0.0` inside the container so the Nuxt container
can reach it by Docker service-name DNS, but with **no host port mapping**
— only the Nuxt UI's own port is host-exposed, matching how
`plantuml-renderer` is reached internally (`http://plantuml-renderer:3000`)
independent of its separate host-debug port mapping. The raw device/QR data
is never directly reachable from outside the Docker network.

Routes:

- **`GET /api/devices`** → `[{ name, label, status: "connected"|"pending"|"disconnected" }]`,
  sourced from a small in-memory registry (`lib/device-status.ts`, same
  "register once, read later" pattern as `lib/whatsapp-client.ts`) that
  each device's `'qr'`/`'ready'`/`'disconnected'` handlers update.
- **`GET /api/devices/:name/qr.png`** → the current pending QR rendered as
  a PNG (new dependency: `qrcode`, `toBuffer` on the raw string from the
  `'qr'` event) — `404` if that device isn't currently `pending`.

### 6. Nuxt UI App

New service (`whatsap/devices-ui/`), same conventions as the root repo's
existing `ui/` app — SSR, thin `server/api/*` Nitro handlers,
`runtimeConfig` for the backend URL.

**Pages:**
- **`/devices`** — every device (from `GET /api/devices`, proxied) as a
  row/tile with a status badge, linking to `/devices/<name>`, plus an "Add
  Device" form (name + label).
- **`/devices/<name>`** — dedicated QR page. Polls `GET /api/devices` every
  ~2s for this device's status; while `pending`, shows
  `GET /api/devices/<name>/qr.png` (re-fetched each poll, so a
  regenerated/expired QR updates automatically); once `connected`, shows a
  success state; if the device isn't in the live list yet (just submitted,
  not yet picked up from `new-devices/`), shows a brief "Setting up..."
  state until it appears.

**Create flow** — the one place this app doesn't proxy: submitting "Add
Device" hits a Nitro route that writes directly to the shared
`new-devices/<name>.md` file (not an API call to `whatsap`, per §4) and
redirects to `/devices/<name>`, which naturally cycles through
"Setting up..." → QR → connected as `whatsap`'s poller picks it up.

**Docker wiring** (`docker-compose-whatsap.yml`): new `devices-ui` service,
`depends_on: whatsap`, `environment: WHATSAP_API_URL: http://whatsap:<port>`
(internal only), host-exposed on its own port (this *is* the user-facing
piece), volume-mounts the same `./whatsap/devices` and `./whatsap/new-devices`
host directories `whatsap` uses.

## Data Flow Summary

```
Adding a device:
  Nuxt "Add Device" form → Nitro route writes new-devices/<name>.md (shared volume)
  → whatsap's onboarding poller (≤5s) picks it up → createDeviceBot()
  → devices/<name>/ subtree created, new-devices/<name>.md deleted
  → device appears in GET /api/devices as "pending", QR available
  → Nuxt /devices/<name> page shows it (polling) → user scans
  → 'ready' fires → status becomes "connected"

Live chat message (any device):
  bot.ts's MESSAGE handler (device-scoped) → device:<name>:... thread id
  → per-device agent instance (own memory/) → reply via that device's client

Scheduled task (any device):
  scheduler.ts polls devices/<name>/tasks/ independently per device
  → fires with device:<name>:scheduled:... thread id
  → delivers via that device's own client
```

## Error Handling

No change to the existing scheduled-task error handling (log + retry next
poll, no dead-letter). New failure modes this design introduces:

- A device stuck in `pending` (QR never scanned) is not an error — it just
  sits there; the UI keeps polling and re-showing whatever QR is current.
- If `createDeviceBot()` itself throws for a device (e.g. corrupt session),
  log it and leave that device out of the live registry rather than
  crashing the whole process — other devices must be unaffected.
- A malformed `new-devices/<name>.md` (fails frontmatter parsing) is
  logged and left in place (not deleted) so it doesn't silently vanish —
  matching this project's general philosophy of not deleting user-facing
  input that failed validation.

## Testing / Verification Plan

Consistent with this project's established practice: vitest for pure logic,
real end-to-end verification against the running containers for anything
touching the live WhatsApp client, Docker networking, or the Nuxt UI.

1. **Unit tests** (vitest): `lib/devices.ts` (`listDeviceNames`,
   `readDevice`, same shape of tests as `lib/tasks.test.ts`); `lib/tasks.ts`'s
   updated device-parameterized functions (round-trip per device, confirm
   two devices' tasks don't collide); the `device:<name>:` prefix
   parsing/stripping logic used by `get_current_chat` and the scheduling
   tools (first-run and prefixed/unprefixed cases).
2. **End-to-end, single device (regression)**: confirm the migrated
   `devices/primary/` device behaves identically to today — live chat,
   scheduled tasks, memory, coaching notes all still work after migration.
3. **End-to-end, second device via the UI**: use the Nuxt "Add Device" form
   to create a second device, confirm it's picked up within the poll
   interval, its QR renders and updates, scanning connects it, and it gets
   its own independent `tasks/`/`memory/` — a scheduled task on device A
   must never appear in device B's `tasks/` or fire through device B's
   client.
4. **End-to-end, restart-free onboarding**: confirm no `whatsap` container
   restart occurs anywhere in the device-creation flow (watch container
   uptime through the whole test).
5. **End-to-end, manual file-drop path**: hand-write a `new-devices/<name>.md`
   directly (bypassing the UI) and confirm it's picked up identically.
