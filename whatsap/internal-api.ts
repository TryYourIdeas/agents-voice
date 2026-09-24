// internal-api.ts
//
// Small JSON+image API for the Nuxt UI (devices-ui) to consume — see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md's
// "Internal API" section. Devices themselves are still only ever *created*
// by writing to new-devices/ (see device-onboarding.ts), whether by hand or
// by devices-ui's Nitro server writing directly to the shared volume — never
// through a call into this API. The one deliberate exception is
// POST /api/devices/:name/reconnect: a device's *live* connection (not its
// on-disk device.md) can be told to reconnect, e.g. from devices-ui's
// "Reconnect" button on a disconnected device.
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
const RECONNECT_PATH_RE = /^\/api\/devices\/([a-z0-9-]+)\/reconnect$/;

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

export function startInternalApi(reconnectDevice: (name: string) => Promise<boolean>): void {
    const server = createServer(async (req, res) => {
        const url = new URL(req.url || "/", "http://internal");

        if (req.method === "GET" && url.pathname === "/api/devices") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(listDevicesWithStatus()));
            return;
        }

        const reconnectMatch = url.pathname.match(RECONNECT_PATH_RE);
        if (req.method === "POST" && reconnectMatch) {
            const deviceName = reconnectMatch[1];
            try {
                const ok = await reconnectDevice(deviceName);
                res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok }));
            } catch (err) {
                console.error(`[internal-api] reconnect failed for '${deviceName}':`, err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "Reconnect failed." }));
            }
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
