// index.ts
//
// Multi-device orchestrator: boots a bot (see bot.ts) for every already-
// configured device, recovers/onboards anything pending in new-devices/,
// starts the shared scheduler across all of them, and keeps the onboarding
// poller running so new devices can come online without a restart — see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md.

import { createDeviceBot } from './bot.ts'
import { listDeviceNames, readDevice, type DeviceConfig } from './lib/devices.ts'
import { pickUpPendingDevices, startDeviceOnboardingPoller } from './device-onboarding.ts'
import { startScheduler, type DeviceHandle } from './scheduler.ts'
import { startInternalApi } from './internal-api.ts'

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
startInternalApi();
