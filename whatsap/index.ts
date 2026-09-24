// index.ts
//
// Multi-device orchestrator: boots a bot (see bot.ts) for every already-
// configured device, recovers/onboards anything pending in new-devices/,
// starts the shared scheduler across all of them, and keeps the onboarding
// poller running so new devices can come online without a restart — see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md.

import { createDeviceBot, reconnectDevice } from './bot.ts'
import { listDeviceNames, readDevice, type DeviceConfig } from './lib/devices.ts'
import { pickUpPendingDevices, startDeviceOnboardingPoller } from './device-onboarding.ts'
import { startScheduler, type DeviceHandle } from './scheduler.ts'
import { startInternalApi } from './internal-api.ts'

// whatsapp-web.js's own Client.js re-injects page bindings on every
// 'framenavigated' event (see its Client.js, the pupPage.on('framenavigated',
// ...) listener) via an unawaited async callback. During a WhatsApp-initiated
// LOGOUT/reconnect cycle, multiple navigations can fire close enough together
// that two overlapping inject() calls both see a binding (e.g.
// onQRChangedEvent) as absent and both try to add it — the library's own
// exposeFunctionIfAbsent (src/util/Puppeteer.js) check-then-act isn't atomic,
// so the second call throws "already exists". That throw is inside a
// library-internal listener we don't control, so it can't be caught at the
// call site the way client.initialize()'s rejection is caught in bot.ts —
// left unhandled, it crashes the whole process (Node 15+ default), taking
// every other device down with it, not just the one whose session lapsed.
// Logging and continuing here is the same fix in spirit as bot.ts's
// initialize().catch(), just at the process level for errors that originate
// deeper inside the library than any one client's call sites reach.
process.on('unhandledRejection', (reason) => {
    console.error('[fatal-guard] unhandled promise rejection (continuing so other devices stay up):', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[fatal-guard] uncaught exception (continuing so other devices stay up):', err);
});

// Mutated in place (never reassigned) as devices come online, including
// after startup via the onboarding poller — scheduler.ts's setInterval
// closes over this same array reference, so it sees new devices on its
// very next tick without any extra wiring.
const activeDevices: DeviceHandle[] = [];

function bootDevice(device: DeviceConfig): void {
    if (device.status !== 'active') return;
    if (activeDevices.some((d) => d.name === device.name)) return;
    const client = createDeviceBot(device);
    activeDevices.push({ name: device.name, client });
}

// Called from internal-api.ts's POST /api/devices/:name/reconnect (e.g. the
// devices-ui "Reconnect" button on a disconnected device). Updates the
// existing DeviceHandle in place — scheduler.ts closes over this same
// `activeDevices` array, so it picks up the new client on its very next
// poll tick without any extra wiring, same as a newly onboarded device.
async function reconnectDeviceByName(name: string): Promise<boolean> {
    const device = readDevice(name);
    if (!device) return false;
    const client = await reconnectDevice(device);
    const handle = activeDevices.find((d) => d.name === name);
    if (handle) {
        handle.client = client;
    } else {
        activeDevices.push({ name, client });
    }
    return true;
}

// Recover anything left over from a prior restart before processing
// already-onboarded devices, so both paths converge on the same
// bootDevice()/createDeviceBot() call before the scheduler starts.
pickUpPendingDevices(bootDevice);

for (const name of listDeviceNames()) {
    const device = readDevice(name);
    if (device) bootDevice(device);
}

startScheduler(activeDevices);
startDeviceOnboardingPoller(bootDevice);
startInternalApi(reconnectDeviceByName);
