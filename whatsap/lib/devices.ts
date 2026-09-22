// lib/devices.ts
//
// Device config storage, mirroring lib/tasks.ts's shape. See
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter, parseMetadataField } from "langchain-agent-kit";

export const DEVICES_DIR = "./devices";

// Device names double as LocalAuth clientIds and directory names — same
// path-traversal-safe restriction as named-agents.ts's AGENT_NAME_RE and
// lib/tasks.ts's NAME_RE.
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface DeviceConfig {
    name: string;
    label: string;
    status: "active" | "paused";
}

export function validateDeviceName(name: string): boolean {
    return NAME_RE.test(name);
}

export function listDeviceNames(): string[] {
    if (!existsSync(DEVICES_DIR)) return [];
    return readdirSync(DEVICES_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(path.join(DEVICES_DIR, e.name, "device.md")))
        .map((e) => e.name);
}

export function readDevice(name: string): DeviceConfig | undefined {
    const filePath = path.join(DEVICES_DIR, name, "device.md");
    if (!existsSync(filePath)) return undefined;
    const { metadata } = parseFrontmatter(readFileSync(filePath, "utf-8"));
    return {
        name: parseMetadataField(metadata, "name") || name,
        label: parseMetadataField(metadata, "label") || name,
        status: parseMetadataField(metadata, "status") === "paused" ? "paused" : "active",
    };
}

// Parses the outermost "device:<name>:" prefix every conversation thread id
// now carries back off, returning the device name and whatever thread-id
// scheme was wrapped inside it (a raw chatId, an "agent:<name>:<chatId>"
// form, or a "scheduled:<taskName>:<timestamp>" form) unchanged — so
// existing parsing logic (tools/get-current-chat.tool.ts,
// agent-delegation-middleware.ts) keeps working exactly as it did before
// devices existed, just operating on `rest` instead of the raw thread id.
export function parseDeviceThreadId(threadId: string): { device: string; rest: string } | undefined {
    const match = threadId.match(/^device:([a-z0-9-]+):(.+)$/);
    if (!match) return undefined;
    return { device: match[1], rest: match[2] };
}
