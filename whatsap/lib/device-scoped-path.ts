// lib/device-scoped-path.ts
//
// Resolves a tool-provided relative path against the calling device's own
// directory (devices/<device>/<relativePath>) instead of the app root, so
// that any file a tool creates, downloads, or reads on behalf of a device
// conversation stays inside that device's own space — see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md and the
// follow-up device-scoped-file-io design. Every file tool (read/write/list/
// check/create-directory/download/render-diagram/web-search's own research
// log) resolves through this instead of joining against process.cwd()
// directly, the same way lib/tasks.ts already does for task files.

import path from "node:path";
import { parseDeviceThreadId } from "./devices.ts";

// Pulls the device name out of the LangChain tool config's thread_id —
// every real agent invocation (default agent, named agent, scheduled task)
// builds a "device:<name>:..." thread_id (see agent.ts/named-agents.ts), so
// this is always available except in a genuinely context-free call (e.g. a
// tool invoked directly outside any conversation), which is treated as an
// error rather than silently falling back to some global directory.
export function resolveDeviceDir(config: any): string {
    const threadId = config?.configurable?.thread_id as string | undefined;
    const parsed = threadId ? parseDeviceThreadId(threadId) : undefined;
    if (!parsed) {
        throw new Error(
            "Could not determine which device this operation belongs to (no device context available in this conversation)."
        );
    }
    return path.join("devices", parsed.device);
}

// Joins relativePath onto the device's directory and rejects anything that
// would resolve outside of it (e.g. "../../etc/passwd") — the whole point
// of device-scoping is that a device's files stay in its own directory, so
// a path that escapes it is treated as an error rather than silently
// reaching into another device's data or the rest of the app.
export function resolveDeviceScopedPath(config: any, relativePath: string): string {
    const deviceDir = resolveDeviceDir(config);
    const fullPath = path.join(deviceDir, relativePath);
    const normalizedDeviceDir = path.resolve(deviceDir);
    const normalizedFullPath = path.resolve(fullPath);
    if (normalizedFullPath !== normalizedDeviceDir && !normalizedFullPath.startsWith(normalizedDeviceDir + path.sep)) {
        throw new Error(`Path '${relativePath}' escapes the device's own directory — only relative paths within it are allowed.`);
    }
    return fullPath;
}
