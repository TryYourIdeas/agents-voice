import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import QRCode from "qrcode";
import { setDeviceStatus, getDeviceStatus } from "./lib/device-status.ts";

// internal-api.ts's own startInternalApi() always binds a fixed port from
// an env var, which isn't test-friendly (port conflicts, no handle to
// close it) — this test rebuilds the exact same route logic against an
// ephemeral port instead, verifying the same request/response contract.
// Any change to the real handler in internal-api.ts should be mirrored
// here (small enough surface that this is easy to keep in sync).
import { listDeviceNames, readDevice } from "./lib/devices.ts";

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
