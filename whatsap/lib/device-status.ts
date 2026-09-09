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
