import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveDeviceDir, resolveDeviceScopedPath } from "./device-scoped-path.ts";

function configWithThreadId(threadId: string | undefined) {
    return { configurable: { thread_id: threadId } };
}

describe("resolveDeviceDir", () => {
    it("extracts the device directory from a default-agent thread id", () => {
        expect(resolveDeviceDir(configWithThreadId("device:primary:some-chat-id"))).toBe(path.join("devices", "primary"));
    });

    it("extracts the device directory from a named-agent thread id", () => {
        expect(resolveDeviceDir(configWithThreadId("device:miriela-cell:agent:story-coach:chat-id"))).toBe(
            path.join("devices", "miriela-cell")
        );
    });

    it("throws when there's no thread_id at all", () => {
        expect(() => resolveDeviceDir(configWithThreadId(undefined))).toThrow(/no device context/);
    });

    it("throws when the thread_id doesn't carry a device prefix", () => {
        expect(() => resolveDeviceDir(configWithThreadId("some-legacy-thread-id"))).toThrow(/no device context/);
    });

    it("throws when config itself is missing", () => {
        expect(() => resolveDeviceDir(undefined)).toThrow(/no device context/);
    });
});

describe("resolveDeviceScopedPath", () => {
    const config = configWithThreadId("device:primary:chat-id");

    it("joins a relative path onto the device directory", () => {
        expect(resolveDeviceScopedPath(config, "ai-news/index.md")).toBe(path.join("devices", "primary", "ai-news", "index.md"));
    });

    it("allows the device directory itself", () => {
        expect(resolveDeviceScopedPath(config, ".")).toBe(path.join("devices", "primary"));
    });

    it("rejects a path that escapes the device directory via ..", () => {
        expect(() => resolveDeviceScopedPath(config, "../other-device/secret.md")).toThrow(/escapes the device/);
    });

    it("rejects a deeply nested escape attempt", () => {
        expect(() => resolveDeviceScopedPath(config, "a/b/../../../../etc/passwd")).toThrow(/escapes the device/);
    });
});
