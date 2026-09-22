// device-onboarding.ts
//
// Picks up new-devices/<name>.md drops and materializes them under
// devices/<name>/ — see docs/superpowers/specs/2026-09-08-multi-device-support-design.md's
// "Device Onboarding" section. A device becomes usable without restarting
// the whatsap container: the Nuxt UI (a later plan) writes directly to the
// shared new-devices/ volume; this poller (plus a one-time startup pass)
// is what turns that into a running bot.

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter, parseMetadataField } from "langchain-agent-kit";
import { DEVICES_DIR, validateDeviceName, type DeviceConfig } from "./lib/devices.ts";

const NEW_DEVICES_DIR = "./new-devices";
const POLL_INTERVAL_MS = process.env.DEVICE_ONBOARDING_POLL_INTERVAL_MS
    ? Number(process.env.DEVICE_ONBOARDING_POLL_INTERVAL_MS)
    : 5000;

interface PendingDevice {
    name: string;
    label: string;
}

function listPendingDeviceNames(): string[] {
    if (!existsSync(NEW_DEVICES_DIR)) return [];
    return readdirSync(NEW_DEVICES_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => e.name.replace(/\.md$/, ""));
}

function readPendingDevice(fileBaseName: string): PendingDevice | undefined {
    const filePath = path.join(NEW_DEVICES_DIR, `${fileBaseName}.md`);
    if (!existsSync(filePath)) return undefined;
    const { metadata } = parseFrontmatter(readFileSync(filePath, "utf-8"));
    return {
        name: parseMetadataField(metadata, "name") || fileBaseName,
        label: parseMetadataField(metadata, "label") || fileBaseName,
    };
}

// Creates the full devices/<name>/ subtree for a newly onboarded device:
// device.md, session/, memory/, tasks/ (with archive/ and memory/, and
// seeded index.md files matching the empty-state format lib/tasks.ts's
// regenerateIndex produces).
function materializeDevice(name: string, label: string): DeviceConfig {
    const deviceDir = path.join(DEVICES_DIR, name);
    mkdirSync(path.join(deviceDir, "session"), { recursive: true });
    mkdirSync(path.join(deviceDir, "memory"), { recursive: true });
    mkdirSync(path.join(deviceDir, "tasks", "archive"), { recursive: true });
    mkdirSync(path.join(deviceDir, "tasks", "memory"), { recursive: true });
    writeFileSync(path.join(deviceDir, "tasks", "index.md"), "# Active Tasks\n\n(No tasks.)\n", "utf-8");
    writeFileSync(path.join(deviceDir, "tasks", "archive", "index.md"), "# Archived Tasks\n\n(No tasks.)\n", "utf-8");
    writeFileSync(
        path.join(deviceDir, "device.md"),
        `---\nname: ${name}\nlabel: ${label}\nstatus: active\n---\n\n${label}\n`,
        "utf-8"
    );
    return { name, label, status: "active" };
}

// Picks up every pending request under new-devices/, materializes it under
// devices/, deletes the pending file, and calls onDeviceReady for each so
// the caller (index.ts) can start its bot and register it with the
// scheduler — used both at startup (to recover anything left over from a
// prior restart) and on every poll tick thereafter. A malformed pending
// file (fails validation) is logged and left in place rather than deleted,
// so it doesn't silently vanish.
export function pickUpPendingDevices(onDeviceReady: (device: DeviceConfig) => void): void {
    for (const fileBaseName of listPendingDeviceNames()) {
        try {
            const pending = readPendingDevice(fileBaseName);
            if (!pending || !validateDeviceName(pending.name)) {
                console.error(`[device-onboarding] invalid pending device '${fileBaseName}', leaving in place`);
                continue;
            }
            const device = materializeDevice(pending.name, pending.label);
            unlinkSync(path.join(NEW_DEVICES_DIR, `${fileBaseName}.md`));
            console.log(`[device-onboarding] onboarded device '${device.name}'`);
            onDeviceReady(device);
        } catch (err) {
            console.error(`[device-onboarding] failed to onboard '${fileBaseName}':`, err);
        }
    }
}

export function startDeviceOnboardingPoller(onDeviceReady: (device: DeviceConfig) => void): void {
    setInterval(() => pickUpPendingDevices(onDeviceReady), POLL_INTERVAL_MS);
}
