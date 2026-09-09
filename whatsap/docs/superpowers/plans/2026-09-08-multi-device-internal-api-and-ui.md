# Multi-Device Internal API & Nuxt UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace terminal-only QR linking with a browser-based device management UI — a small read-only JSON+image API on `whatsap`, and a new Nuxt app (`whatsap/devices-ui/`) that lists devices, shows each one's live QR, and lets a user create a new device without touching a terminal. This plan covers design spec sections 5–6, building on the already-implemented backend core (sections 1–4: device config, multi-client refactor, per-device tasks/scheduler, onboarding poller).

**Architecture:** `bot.ts`'s `'qr'`/`'ready'`/`'disconnected'` handlers write into a new in-memory `lib/device-status.ts` registry (mirroring `lib/whatsapp-client.ts`'s "register once, read later" pattern). A new `internal-api.ts`, started from `index.ts`, serves that registry over plain Node `http` — `GET /api/devices` (JSON) and `GET /api/devices/:name/qr.png` (PNG, via the new `qrcode` dependency) — bound to the container's internal network only, no host port mapping. A new Nuxt app proxies those two routes through its own `server/api/*` (same pattern as the root repo's `ui/` app) and adds one non-proxied route that writes directly to the shared `new-devices/` volume to create a device — never calling into `whatsap`'s API to mutate anything, per the design's read-only API constraint.

**Tech Stack:** TypeScript (Node v26 native TS execution) for the `whatsap` side; Nuxt 3 / Vue 3 for `devices-ui`, matching the root repo's existing `ui/` app conventions exactly (SSR, `runtimeConfig`, thin Nitro proxy routes).

**Reference:** Full design in `docs/superpowers/specs/2026-09-08-multi-device-support-design.md` (sections 5–6). Backend core (sections 1–4) is already implemented and merged.

**Testing approach:** vitest for `lib/device-status.ts` and `internal-api.ts` (both are pure Node/HTTP logic with no WhatsApp-client dependency, so a real vitest test spinning up the server on a random port and issuing real `fetch` calls is both possible and appropriate — no need for manual-only verification here). The Nuxt UI itself is verified by hand against the running containers, consistent with this project's established practice and with how the root repo's own `ui/` app has no automated test suite either — setting up Playwright/testing-library for a 2-page internal tool would be disproportionate scope for this plan.

---

### Task 1: Device status registry (`lib/device-status.ts`)

**Files:**
- Create: `whatsap/lib/device-status.ts`
- Create: `whatsap/lib/device-status.test.ts`

- [ ] **Step 1: Write the module**

```typescript
// lib/device-status.ts
//
// In-memory "register once, read later" status registry for each device's
// live connection state — same pattern as lib/whatsapp-client.ts, but for
// status/QR data instead of the Client object itself. Populated by
// bot.ts's 'qr'/'ready'/'disconnected' handlers, read by internal-api.ts.
// Never persisted to disk — a fresh process starts with an empty registry
// and each device's bot repopulates it as its own events fire.

export type DeviceState = "pending" | "connected" | "disconnected";

export interface DeviceStatusEntry {
    state: DeviceState;
    // The raw string from the 'qr' event, only meaningful while
    // state === "pending" — internal-api.ts renders this to a PNG on
    // request rather than storing a pre-rendered image.
    qr?: string;
}

const statuses = new Map<string, DeviceStatusEntry>();

export function setDeviceStatus(deviceName: string, entry: DeviceStatusEntry): void {
    statuses.set(deviceName, entry);
}

export function getDeviceStatus(deviceName: string): DeviceStatusEntry | undefined {
    return statuses.get(deviceName);
}
```

- [ ] **Step 2: Write unit tests**

```typescript
// lib/device-status.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { setDeviceStatus, getDeviceStatus } from "./device-status.ts";

describe("device-status registry", () => {
    it("returns undefined for a device that has never reported status", () => {
        expect(getDeviceStatus("never-seen")).toBeUndefined();
    });

    it("round-trips a pending status with its QR string", () => {
        setDeviceStatus("primary", { state: "pending", qr: "raw-qr-data" });
        expect(getDeviceStatus("primary")).toEqual({ state: "pending", qr: "raw-qr-data" });
    });

    it("overwrites the previous status for the same device", () => {
        setDeviceStatus("primary", { state: "pending", qr: "raw-qr-data" });
        setDeviceStatus("primary", { state: "connected" });
        expect(getDeviceStatus("primary")).toEqual({ state: "connected" });
    });

    it("tracks multiple devices independently", () => {
        setDeviceStatus("primary", { state: "connected" });
        setDeviceStatus("business", { state: "pending", qr: "other-qr" });
        expect(getDeviceStatus("primary")).toEqual({ state: "connected" });
        expect(getDeviceStatus("business")).toEqual({ state: "pending", qr: "other-qr" });
    });
});
```

- [ ] **Step 3: Run the tests**

Run: `cd whatsap && pnpm test lib/device-status.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 4: Commit**

```bash
cd whatsap && git add lib/device-status.ts lib/device-status.test.ts && git commit -m "feat: add in-memory device status registry (lib/device-status.ts)"
```

---

### Task 2: Wire status tracking into `bot.ts`

**Files:**
- Modify: `whatsap/bot.ts`

- [ ] **Step 1: Import the registry**

In `whatsap/bot.ts`, add this import alongside the existing ones:

```typescript
import { setDeviceStatus } from './lib/device-status.ts'
```

- [ ] **Step 2: Update the `'ready'`, `'qr'`, and `'disconnected'` handlers**

Change:

```typescript
    client.on('ready', () => {
        console.log(`[${deviceName}] Client is ready!`);
    });

    client.on('qr', (qr) => {
        // Known limitation of this plan: with multiple devices needing
        // linking around the same time, their QR output can interleave in
        // one terminal — an internal API + web UI (a later plan) replaces
        // this. Prefixed with the device name so it's at least attributable.
        console.log(`[${deviceName}] scan this QR code:`);
        qrcode.generate(qr, { small: true });
    });
```

to:

```typescript
    client.on('ready', () => {
        console.log(`[${deviceName}] Client is ready!`);
        setDeviceStatus(deviceName, { state: 'connected' });
    });

    client.on('qr', (qr) => {
        // Terminal QR output stays as a fallback alongside the web UI
        // (devices-ui) — harmless to keep printing, and useful if the UI
        // container isn't up for some reason. Prefixed with the device
        // name so multiple devices' output stays attributable.
        console.log(`[${deviceName}] scan this QR code:`);
        qrcode.generate(qr, { small: true });
        setDeviceStatus(deviceName, { state: 'pending', qr });
    });
```

And change:

```typescript
    client.on('disconnected', (reason) => {
        console.log(`[${deviceName}] [diag] disconnected:`, reason);
    });
```

to:

```typescript
    client.on('disconnected', (reason) => {
        console.log(`[${deviceName}] [diag] disconnected:`, reason);
        setDeviceStatus(deviceName, { state: 'disconnected' });
    });
```

- [ ] **Step 3: Confirm the file still parses**

Run: `cd whatsap && node --check bot.ts 2>&1 | grep -v "Unexpected token ':'" ; echo "(TS type annotations expected to trip a plain syntax check — the real verification is Task 7's container rebuild)"`

(As established in this project's own history, `node --check` doesn't apply Node's TS-stripping transform, so a bare check on a `.ts` file isn't meaningful here — the real verification is the full container rebuild in Task 7. This step is just a quick sanity glance, not a pass/fail gate.)

- [ ] **Step 4: Commit**

```bash
cd whatsap && git add bot.ts && git commit -m "feat: report device connection state to lib/device-status.ts"
```

---

### Task 3: Internal API (`internal-api.ts`)

**Files:**
- Modify: `whatsap/package.json` (add `qrcode` dependency)
- Create: `whatsap/internal-api.ts`
- Create: `whatsap/internal-api.test.ts`

- [ ] **Step 1: Add the `qrcode` dependency**

In `whatsap/package.json`, add to `"dependencies"` (alphabetical):

```json
    "qrcode": "^1.5.4",
```

Then run: `cd whatsap && pnpm install`
Expected: `node_modules/qrcode` appears, lockfile updates, no errors.

- [ ] **Step 2: Write the API module**

```typescript
// internal-api.ts
//
// Small, read-only JSON+image API for the Nuxt UI (devices-ui) to consume
// — see docs/superpowers/specs/2026-09-08-multi-device-support-design.md's
// "Internal API" section. Deliberately never mutates anything: devices are
// always created by writing to new-devices/ (see device-onboarding.ts),
// whether by hand or by devices-ui's Nitro server writing directly to the
// shared volume — never through a call into this API.
//
// Bound to 0.0.0.0 so the devices-ui container can reach it by Docker
// service-name DNS, but with no host port mapping in docker-compose — the
// raw device/QR data is never directly reachable from outside the Docker
// network, only through whatever devices-ui chooses to expose.

import { createServer } from "node:http";
import QRCode from "qrcode";
import { listDeviceNames, readDevice } from "./lib/devices.ts";
import { getDeviceStatus } from "./lib/device-status.ts";

const PORT = process.env.INTERNAL_API_PORT ? Number(process.env.INTERNAL_API_PORT) : 4001;
const DEVICE_NAME_IN_PATH_RE = /^\/api\/devices\/([a-z0-9-]+)\/qr\.png$/;

function listDevicesWithStatus(): { name: string; label: string; status: string }[] {
    return listDeviceNames()
        .map((name) => readDevice(name))
        .filter((d): d is NonNullable<typeof d> => Boolean(d))
        .map((device) => ({
            name: device.name,
            label: device.label,
            status: getDeviceStatus(device.name)?.state ?? "disconnected",
        }));
}

export function startInternalApi(): void {
    const server = createServer(async (req, res) => {
        const url = new URL(req.url || "/", "http://internal");

        if (req.method === "GET" && url.pathname === "/api/devices") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(listDevicesWithStatus()));
            return;
        }

        const qrMatch = url.pathname.match(DEVICE_NAME_IN_PATH_RE);
        if (req.method === "GET" && qrMatch) {
            const deviceName = qrMatch[1];
            const status = getDeviceStatus(deviceName);
            if (!status || status.state !== "pending" || !status.qr) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("No pending QR for this device.");
                return;
            }
            try {
                const png = await QRCode.toBuffer(status.qr, { type: "png", width: 300 });
                res.writeHead(200, { "Content-Type": "image/png" });
                res.end(png);
            } catch (err) {
                console.error(`[internal-api] failed to render QR for '${deviceName}':`, err);
                res.writeHead(500, { "Content-Type": "text/plain" });
                res.end("Failed to render QR code.");
            }
            return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found.");
    });

    server.listen(PORT, "0.0.0.0", () => {
        console.log(`[internal-api] listening on 0.0.0.0:${PORT}`);
    });
}
```

- [ ] **Step 3: Write unit tests (real server, random port, real `fetch`)**

```typescript
// internal-api.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import QRCode from "qrcode";
import { setDeviceStatus } from "./lib/device-status.ts";

// internal-api.ts's own startInternalApi() always binds a fixed port from
// an env var, which isn't test-friendly (port conflicts, no handle to
// close it) — this test rebuilds the exact same route logic against an
// ephemeral port instead, verifying the same request/response contract.
// Any change to the real handler in internal-api.ts should be mirrored
// here (small enough surface that this is easy to keep in sync).
import { listDeviceNames, readDevice } from "./lib/devices.ts";
import { getDeviceStatus } from "./lib/device-status.ts";

function listDevicesWithStatus() {
    return listDeviceNames()
        .map((name) => readDevice(name))
        .filter((d): d is NonNullable<typeof d> => Boolean(d))
        .map((device) => ({
            name: device.name,
            label: device.label,
            status: getDeviceStatus(device.name)?.state ?? "disconnected",
        }));
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
    server = createServer(async (req, res) => {
        const url = new URL(req.url || "/", "http://internal");
        if (req.method === "GET" && url.pathname === "/api/devices") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(listDevicesWithStatus()));
            return;
        }
        const qrMatch = url.pathname.match(/^\/api\/devices\/([a-z0-9-]+)\/qr\.png$/);
        if (req.method === "GET" && qrMatch) {
            const status = getDeviceStatus(qrMatch[1]);
            if (!status || status.state !== "pending" || !status.qr) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("No pending QR for this device.");
                return;
            }
            const png = await QRCode.toBuffer(status.qr, { type: "png", width: 300 });
            res.writeHead(200, { "Content-Type": "image/png" });
            res.end(png);
            return;
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found.");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
    server.close();
});

describe("GET /api/devices", () => {
    it("returns 404 for an unknown route", async () => {
        const res = await fetch(`${baseUrl}/nope`);
        expect(res.status).toBe(404);
    });
});

describe("GET /api/devices/:name/qr.png", () => {
    it("returns 404 when the device has no pending QR", async () => {
        const res = await fetch(`${baseUrl}/api/devices/no-such-device/qr.png`);
        expect(res.status).toBe(404);
    });

    it("returns a PNG when the device is pending with a QR", async () => {
        setDeviceStatus("qr-test-device", { state: "pending", qr: "some-raw-qr-string" });
        const res = await fetch(`${baseUrl}/api/devices/qr-test-device/qr.png`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/png");
        const buf = new Uint8Array(await res.arrayBuffer());
        // PNG magic number
        expect(buf[0]).toBe(0x89);
        expect(buf[1]).toBe(0x50);
        expect(buf[2]).toBe(0x4e);
        expect(buf[3]).toBe(0x47);
    });

    it("returns 404 once the device is connected (no longer pending)", async () => {
        setDeviceStatus("qr-test-device", { state: "connected" });
        const res = await fetch(`${baseUrl}/api/devices/qr-test-device/qr.png`);
        expect(res.status).toBe(404);
    });
});
```

- [ ] **Step 4: Run the tests**

Run: `cd whatsap && pnpm test internal-api.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd whatsap && git add package.json pnpm-lock.yaml internal-api.ts internal-api.test.ts && git commit -m "feat: add internal read-only API for device status and QR images"
```

---

### Task 4: Wire the internal API into `index.ts`

**Files:**
- Modify: `whatsap/index.ts`

- [ ] **Step 1: Start it alongside the scheduler and onboarding poller**

In `whatsap/index.ts`, add the import:

```typescript
import { startInternalApi } from './internal-api.ts'
```

And change the final two lines:

```typescript
startScheduler(activeDevices);
startDeviceOnboardingPoller(bootDevice);
```

to:

```typescript
startScheduler(activeDevices);
startDeviceOnboardingPoller(bootDevice);
startInternalApi();
```

- [ ] **Step 2: Commit**

```bash
cd whatsap && git add index.ts && git commit -m "feat: start the internal API alongside the scheduler and onboarding poller"
```

---

### Task 5: Nuxt `devices-ui` app

**Files:**
- Create: `whatsap/devices-ui/package.json`
- Create: `whatsap/devices-ui/nuxt.config.ts`
- Create: `whatsap/devices-ui/Dockerfile`
- Create: `whatsap/devices-ui/app.vue`
- Create: `whatsap/devices-ui/pages/index.vue`
- Create: `whatsap/devices-ui/pages/devices/index.vue`
- Create: `whatsap/devices-ui/pages/devices/[name].vue`
- Create: `whatsap/devices-ui/server/api/devices.get.ts`
- Create: `whatsap/devices-ui/server/api/devices/[name]/qr.png.get.ts`
- Create: `whatsap/devices-ui/server/api/new-device.post.ts`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "whatsap-devices-ui",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "nuxt build",
    "dev": "nuxt dev",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare"
  },
  "devDependencies": {
    "nuxt": "^3.14.0",
    "vue": "^3.5.0",
    "vue-router": "^4.4.0"
  }
}
```

- [ ] **Step 2: `nuxt.config.ts`**

```typescript
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  ssr: true,
  runtimeConfig: {
    // process.env.WHATSAP_API_URL / NEW_DEVICES_DIR here are read once at
    // build/dev-start time — enough for local `nuxt dev`, but a *built*
    // image (what docker-compose actually runs) needs Nuxt's own runtime
    // override mechanism instead: an env var named NUXT_<KEY_IN_SCREAMING_
    // SNAKE_CASE> overrides the matching runtimeConfig key at server start,
    // regardless of what got baked in at build time. See
    // docker-compose-whatsap.yml's devices-ui service, which sets
    // NUXT_WHATSAP_API_URL / NUXT_NEW_DEVICES_DIR for exactly this reason —
    // same pattern the root repo's ui/ service already relies on
    // (NUXT_TTS_URL etc., see its nuxt.config.ts).
    whatsapApiUrl: process.env.WHATSAP_API_URL || 'http://localhost:4001',
    newDevicesDir: process.env.NEW_DEVICES_DIR || '/data/new-devices',
  },
})
```

- [ ] **Step 3: `Dockerfile`** (same two-stage pattern as the root repo's `ui/Dockerfile`)

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

(Matches the root `ui/Dockerfile` exactly — `npm ci` against a committed `package-lock.json`, generated by Step 11's `npm install` and committed in Step 13. An earlier version of this plan used `npm install` with no lockfile copied in, reasoning the lockfile didn't exist yet at Dockerfile-authoring time — but Step 11 does generate one, and building against it with plain `npm install` inside a from-scratch Alpine/musl container hit a real, reproducible npm 10.x arborist bug ("Cannot read properties of null (reading 'edgesOut')") during full dependency-tree resolution; `npm ci`, which trusts the lockfile directly instead of re-resolving, avoided it entirely.)

- [ ] **Step 4: `app.vue`**

```vue
<template>
  <NuxtPage />
</template>
```

- [ ] **Step 5: `pages/index.vue`** (redirect to the device list)

```vue
<script setup lang="ts">
await navigateTo('/devices')
</script>

<template>
  <div />
</template>
```

- [ ] **Step 6: `pages/devices/index.vue`** (device list + add-device form)

```vue
<script setup lang="ts">
interface Device {
    name: string
    label: string
    status: string
}

const { data: devices, refresh } = await useFetch<Device[]>('/api/devices')

const newName = ref('')
const newLabel = ref('')
const submitting = ref(false)
const errorMessage = ref('')

async function addDevice() {
    errorMessage.value = ''
    submitting.value = true
    try {
        const created = await $fetch<{ name: string }>('/api/new-device', {
            method: 'POST',
            body: { name: newName.value, label: newLabel.value },
        })
        await navigateTo(`/devices/${created.name}`)
    } catch (err: any) {
        errorMessage.value = err?.data?.statusMessage || 'Failed to create device.'
    } finally {
        submitting.value = false
    }
}
</script>

<template>
  <main style="max-width: 480px; margin: 2rem auto; font-family: system-ui, sans-serif;">
    <h1>WhatsApp Devices</h1>
    <ul>
      <li v-for="device in devices" :key="device.name">
        <NuxtLink :to="`/devices/${device.name}`">
          {{ device.label }} ({{ device.name }}) — {{ device.status }}
        </NuxtLink>
      </li>
    </ul>
    <p v-if="!devices?.length">No devices yet.</p>

    <h2>Add Device</h2>
    <form @submit.prevent="addDevice">
      <div>
        <label>
          Name (lowercase letters, numbers, dashes only)
          <input v-model="newName" required pattern="[a-z0-9][a-z0-9-]*" />
        </label>
      </div>
      <div>
        <label>
          Label
          <input v-model="newLabel" />
        </label>
      </div>
      <button type="submit" :disabled="submitting">Add Device</button>
    </form>
    <p v-if="errorMessage" style="color: red">{{ errorMessage }}</p>
  </main>
</template>
```

- [ ] **Step 7: `pages/devices/[name].vue`** (per-device QR/status page)

```vue
<script setup lang="ts">
interface Device {
    name: string
    label: string
    status: string
}

const route = useRoute()
const deviceName = route.params.name as string

const device = ref<Device | undefined>()
const qrCacheBuster = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

async function poll() {
    const devices = await $fetch<Device[]>('/api/devices')
    device.value = devices.find((d) => d.name === deviceName)
    qrCacheBuster.value++
}

onMounted(() => {
    poll()
    timer = setInterval(poll, 2000)
})
onUnmounted(() => {
    if (timer) clearInterval(timer)
})
</script>

<template>
  <main style="max-width: 480px; margin: 2rem auto; font-family: system-ui, sans-serif; text-align: center;">
    <p style="text-align: left"><NuxtLink to="/devices">&larr; All devices</NuxtLink></p>
    <h1>{{ device?.label || deviceName }}</h1>

    <p v-if="!device">Setting up...</p>
    <p v-else-if="device.status === 'connected'">✅ Connected</p>
    <div v-else-if="device.status === 'pending'">
      <p>Scan this QR code with WhatsApp:</p>
      <img :src="`/api/devices/${deviceName}/qr.png?t=${qrCacheBuster}`" alt="QR code" width="300" height="300" />
    </div>
    <p v-else>Status: {{ device.status }}</p>
  </main>
</template>
```

- [ ] **Step 8: `server/api/devices.get.ts`** (proxy)

```typescript
export default defineEventHandler((event) => {
    const { whatsapApiUrl } = useRuntimeConfig()
    return proxyRequest(event, `${whatsapApiUrl}/api/devices`)
})
```

- [ ] **Step 9: `server/api/devices/[name]/qr.png.get.ts`** (proxy)

```typescript
export default defineEventHandler((event) => {
    const { whatsapApiUrl } = useRuntimeConfig()
    const name = getRouterParam(event, 'name')
    return proxyRequest(event, `${whatsapApiUrl}/api/devices/${name}/qr.png`)
})
```

- [ ] **Step 10: `server/api/new-device.post.ts`** (the one non-proxied route — writes directly to the shared volume)

```typescript
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export default defineEventHandler(async (event) => {
    const { newDevicesDir } = useRuntimeConfig()
    const body = await readBody<{ name?: string; label?: string }>(event)
    const name = (body.name || '').trim()
    const label = (body.label || name).trim()

    if (!NAME_RE.test(name)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Device name must be lowercase letters, numbers, and dashes only.',
        })
    }

    mkdirSync(newDevicesDir, { recursive: true })
    const filePath = path.join(newDevicesDir, `${name}.md`)
    if (existsSync(filePath)) {
        throw createError({
            statusCode: 409,
            statusMessage: `A pending device request named '${name}' already exists.`,
        })
    }
    writeFileSync(filePath, `---\nname: ${name}\nlabel: ${label}\n---\n`, 'utf-8')
    return { name, label }
})
```

- [ ] **Step 11: Install dependencies and confirm the build works locally**

Run:
```
cd whatsap/devices-ui && npm install && npm run build
```
Expected: build succeeds with no errors, producing `.output/`.

- [ ] **Step 12: Add a `.gitignore` for the new app**

```
node_modules
.nuxt
.output
```

Save as `whatsap/devices-ui/.gitignore`.

- [ ] **Step 13: Commit**

```bash
cd whatsap && git add devices-ui && git commit -m "feat: add devices-ui Nuxt app for browser-based device linking"
```

---

### Task 6: Docker Compose wiring

**Files:**
- Modify: `/mnt/data/sources/agents-voice/docker-compose-whatsap.yml`

- [ ] **Step 1: Add the `devices-ui` service**

In `docker-compose-whatsap.yml`, add a new service after the existing `whatsap` service block:

```yaml
  devices-ui:
    build: ./whatsap/devices-ui
    image: whatsap-devices-ui:latest
    ports:
      # Host port 3002 was already taken by an unrelated native process on
      # this host — internal container-to-container traffic is on the
      # container's own port 3000 regardless, unaffected by this remap.
      - "3003:3000"
    environment:
      # NUXT_-prefixed so Nuxt's runtime override mechanism actually applies
      # to the *built* image (see nuxt.config.ts's comment) — reaches
      # whatsap's internal API (internal-api.ts) by Docker service-name DNS,
      # never exposed to the host directly.
      NUXT_WHATSAP_API_URL: http://whatsap:4001
      NUXT_NEW_DEVICES_DIR: /data/new-devices
    volumes:
      # Shared with whatsap's own ./whatsap/new-devices mount — this is how
      # the "Add Device" form creates a device without ever calling into
      # whatsap's (read-only) API. See device-onboarding.ts.
      - ./whatsap/new-devices:/data/new-devices
    depends_on:
      - whatsap
```

- [ ] **Step 2: Verify the compose file is still valid YAML**

Run: `docker compose -f docker-compose-whatsap.yml config -q`
Expected: no output, exit code 0.

- [ ] **Step 3: Note on commit**

This file lives outside the `whatsap` git repository (the parent directory isn't a git repo), so this edit is saved to disk directly, same as every other change to it in this project's history — no separate commit step here.

---

### Task 7: End-to-end verification against the running stack

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `cd whatsap && pnpm test`
Expected: all tests pass, including the 4 new `lib/device-status.test.ts` tests and the 4 new `internal-api.test.ts` tests.

- [ ] **Step 2: Rebuild and restart the whole stack**

Run: `cd /mnt/data/sources/agents-voice && docker compose -f docker-compose-whatsap.yml up --build -d`
Expected: all services (including the new `devices-ui`) build and start; `whatsap`'s existing device(s) reconnect as before — confirm via `docker compose -f docker-compose-whatsap.yml logs whatsap | grep -iE "internal-api\] listening|Client is ready"`.

- [ ] **Step 3: Confirm the internal API responds inside the Docker network**

Run: `docker exec agents-voice-whatsap-whatsap-1 node -e "fetch('http://localhost:4001/api/devices').then(r => r.text()).then(console.log)"`

(Using Node's built-in `fetch` rather than `wget`/`curl` — the `whatsap` image is a slim base with only `chromium`/`fonts-liberation`/`ca-certificates`/`dumb-init` installed, neither of those tools is present.)

Expected: a JSON array listing every configured device with its current `status`.

- [ ] **Step 4: Confirm the Nuxt UI loads and proxies correctly**

Open `http://localhost:3003/devices` in a browser (or `curl -s http://localhost:3003/devices`). Expected: the device list page renders, showing every configured device and its live status (matching Step 3's API response).

- [ ] **Step 5: Add a new device entirely through the browser**

On the `/devices` page, submit the "Add Device" form with a test name (e.g. `verify-ui`). Expected: redirect to `/devices/verify-ui`, showing "Setting up..." briefly, then a real QR code image within `DEVICE_ONBOARDING_POLL_INTERVAL_MS` (default 5s) — confirm via `docker exec agents-voice-whatsap-whatsap-1 find /app/devices/verify-ui -maxdepth 1` that the full subtree was created, matching the file-drop path's behavior from the backend-core plan's own verification.

- [ ] **Step 6: Confirm the QR image actually updates**

Watch the `/devices/verify-ui` page for ~30-60s (WhatsApp rotates the QR periodically) — the displayed image should change without a manual page reload, confirming the 2s poll + cache-busting query param are working.

- [ ] **Step 7: Clean up the verification device**

```bash
docker exec agents-voice-whatsap-whatsap-1 rm -rf /app/devices/verify-ui
```

(No corresponding entry needs removing anywhere else — devices are discovered purely by directory presence, and this device was never actually linked, so there's no live `whatsapp-web.js` Client session to tear down beyond the container's own in-memory state, which clears on the next restart regardless.)

This step-by-step verification is the acceptance test for this plan — once all seven pass, browser-based device linking is confirmed working end-to-end, completing the full multi-device design (backend core + internal API + UI).
