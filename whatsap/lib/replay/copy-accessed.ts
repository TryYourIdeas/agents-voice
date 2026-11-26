// lib/replay/copy-accessed.ts
//
// Before a replay starts, copies the files the ORIGINAL run accessed from the device's real directory into
// the sandbox, so the replayed agent sees the same files (complete, not the 20 KB slice the log kept).
// Read-only on disk; never throws. Files the original run wrote itself are not copied (the disk already
// holds the post-run state; the logged content is the faithful pre-write view).

import fs from "node:fs/promises";
import path from "node:path";
import type { Sandbox } from "./sandbox.ts";
import type { SeedEvent } from "./seed.ts";
import { pdfToText } from "../pdf-to-text.ts";

export const DEFAULT_MAX_FILE_BYTES = Number(process.env.REPLAY_COPY_MAX_FILE_BYTES) || 1_000_000;
export const MAX_DIR_FILES = 100;

const READ_TOOLS = new Set(["my_read_file"]);
const DIR_TOOLS = new Set(["list_directory", "check_directory_exists"]);
const WRITE_TOOLS = new Set(["my_write_file", "download_file"]);

function parse(s: string | null): any {
    try {
        return s ? JSON.parse(s) : undefined;
    } catch {
        return undefined;
    }
}

/** Sandbox-relative form of a tool path (also accepts the `devices/<device>/...` form); undefined if unsafe. */
function rel(p: unknown, device: string): string | undefined {
    if (typeof p !== "string" || !p.trim() || p.startsWith("/") || /^[A-Za-z]:/.test(p)) return undefined;
    let n = path.posix.normalize(p.replace(/\\/g, "/"));
    const prefix = `devices/${device}`;
    if (n === prefix) n = ".";
    else if (n.startsWith(prefix + "/")) n = n.slice(prefix.length + 1);
    if (n === ".." || n.startsWith("../")) return undefined;
    return n === "." ? "" : n.replace(/\/$/, "");
}

export function accessedPaths(events: SeedEvent[], device: string): { read: Set<string>; dirs: Set<string>; written: Set<string> } {
    const out = { read: new Set<string>(), dirs: new Set<string>(), written: new Set<string>() };
    for (const e of events) {
        if (e.kind !== "tool" || e.status === "error" || !e.name) continue;
        const input = parse(e.input);
        if (READ_TOOLS.has(e.name)) {
            const p = rel(input?.file_path, device);
            if (p) out.read.add(p);
        } else if (DIR_TOOLS.has(e.name)) {
            const p = rel(input?.directoryPath, device);
            if (p !== undefined) out.dirs.add(p);
        } else if (WRITE_TOOLS.has(e.name)) {
            const p = rel(input?.file_path ?? input?.destination_path, device);
            if (p) out.written.add(p);
        }
    }
    return out;
}

async function readReal(full: string, maxBytes: number): Promise<string | undefined> {
    const st = await fs.stat(full);
    if (!st.isFile() || st.size > maxBytes) return undefined;
    const data = await fs.readFile(full);
    return /\.pdf$/i.test(full) ? await pdfToText(new Uint8Array(data)) : data.toString("utf-8");
}

export async function copyAccessedFiles(args: {
    events: SeedEvent[];
    device: string;
    /** the device's real directory (devices/<device>) */
    deviceRoot: string;
    sandbox: Sandbox;
    maxFileBytes?: number;
}): Promise<void> {
    const { events, device, deviceRoot, sandbox } = args;
    const max = args.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    const root = path.resolve(deviceRoot);
    const { read, dirs, written } = accessedPaths(events, device);
    const inside = (p: string) => {
        const full = path.resolve(root, p);
        return full === root || full.startsWith(root + path.sep) ? full : undefined;
    };
    const copy = async (p: string) => {
        if (!p || written.has(p)) return;
        const full = inside(p);
        if (!full) return;
        try {
            const text = await readReal(full, max);
            if (text === undefined) return;
            sandbox.files.set(p, text);
            sandbox.seededPaths.add(p);
        } catch {
            // missing/unreadable: the logged content (if any) stays
        }
    };

    for (const p of read) await copy(p);
    for (const dir of dirs) {
        const full = inside(dir);
        if (!full) continue;
        try {
            const entries = await fs.readdir(full, { withFileTypes: true });
            if (dir) sandbox.dirs.add(dir);
            let n = 0;
            for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
                if (n >= MAX_DIR_FILES) break;
                const child = dir ? `${dir}/${ent.name}` : ent.name;
                if (ent.isDirectory()) sandbox.dirs.add(child);
                else if (ent.isFile() && !sandbox.files.has(child)) {
                    await copy(child);
                    n++;
                }
            }
        } catch {
            // directory missing on disk: nothing to copy
        }
    }
}
