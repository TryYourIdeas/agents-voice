import { describe, it, expect } from "vitest";
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
