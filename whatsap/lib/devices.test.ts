import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listDeviceNames, readDevice, validateDeviceName, parseDeviceThreadId } from "./devices.ts";

let scratchDir: string;
let originalCwd: string;

beforeEach(() => {
    originalCwd = process.cwd();
    scratchDir = mkdtempSync(path.join(tmpdir(), "devices-test-"));
    process.chdir(scratchDir);
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(scratchDir, { recursive: true, force: true });
});

function writeDeviceFile(name: string, frontmatter: string) {
    mkdirSync(path.join("devices", name), { recursive: true });
    writeFileSync(path.join("devices", name, "device.md"), `---\n${frontmatter}\n---\n\nBody.\n`, "utf-8");
}

describe("listDeviceNames / readDevice", () => {
    it("returns an empty array when devices/ doesn't exist", () => {
        expect(listDeviceNames()).toEqual([]);
    });

    it("lists a device once its device.md exists", () => {
        writeDeviceFile("primary", "name: primary\nlabel: Primary\nstatus: active");
        expect(listDeviceNames()).toEqual(["primary"]);
    });

    it("readDevice parses all fields, defaulting status to active", () => {
        writeDeviceFile("primary", "name: primary\nlabel: Primary Number");
        expect(readDevice("primary")).toEqual({ name: "primary", label: "Primary Number", status: "active" });
    });

    it("readDevice respects status: paused", () => {
        writeDeviceFile("business", "name: business\nlabel: Business\nstatus: paused");
        expect(readDevice("business")?.status).toBe("paused");
    });

    it("readDevice returns undefined for a device that doesn't exist", () => {
        expect(readDevice("nope")).toBeUndefined();
    });
});

describe("validateDeviceName", () => {
    it("accepts lowercase alphanumeric-with-dashes names", () => {
        expect(validateDeviceName("primary")).toBe(true);
        expect(validateDeviceName("business-2")).toBe(true);
    });

    it("rejects names that could path-traverse or contain unsafe characters", () => {
        expect(validateDeviceName("../etc")).toBe(false);
        expect(validateDeviceName("Has Spaces")).toBe(false);
        expect(validateDeviceName("")).toBe(false);
    });
});

describe("parseDeviceThreadId", () => {
    it("parses a device-prefixed raw chat id", () => {
        expect(parseDeviceThreadId("device:primary:554800000000@c.us")).toEqual({
            device: "primary",
            rest: "554800000000@c.us",
        });
    });

    it("parses a device-prefixed named-agent thread id, leaving the agent: form intact in rest", () => {
        expect(parseDeviceThreadId("device:primary:agent:story-coach:554800000000@c.us")).toEqual({
            device: "primary",
            rest: "agent:story-coach:554800000000@c.us",
        });
    });

    it("parses a device-prefixed scheduled-task thread id", () => {
        expect(parseDeviceThreadId("device:primary:scheduled:daily-news:12345")).toEqual({
            device: "primary",
            rest: "scheduled:daily-news:12345",
        });
    });

    it("returns undefined for a thread id with no device prefix", () => {
        expect(parseDeviceThreadId("554800000000@c.us")).toBeUndefined();
    });
});
