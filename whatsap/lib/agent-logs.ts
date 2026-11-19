// lib/agent-logs.ts
//
// SQLite log of agent activity for later analysis and agent improvement:
//   turns  — one row per user message handled by an agent (default, named, or a
//            sub-agent reached through delegate_to_agent), with the final reply.
//            Sub-agent turns point at the turn that delegated via parent_turn_id.
//   events — what happened inside a turn, in order: each model response
//            (text, thinking, tool calls, token usage) and each tool execution
//            (arguments, result, status, duration).
// Uses Node's built-in node:sqlite (no dependency). Logging must never break the
// agent: every write is wrapped and failures only print a warning.
//
// Contains user messages, email content and other private data: the logs/
// directory is git-ignored and must be treated as sensitive.

import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_MAX_CHARS = 100_000;

export function logsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return !["0", "false", "off"].includes((env.AGENT_LOGS_ENABLED || "").toLowerCase());
}

export function logsDbPath(env: NodeJS.ProcessEnv = process.env): string {
    return env.AGENT_LOGS_DB || path.resolve(process.cwd(), "../logs/agent-logs.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS turns (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_turn_id INTEGER REFERENCES turns(id),
    started_at     TEXT NOT NULL,
    ended_at       TEXT,
    duration_ms    INTEGER,
    device         TEXT,
    chat_id        TEXT,
    thread_id      TEXT,
    agent          TEXT NOT NULL,
    source         TEXT NOT NULL,          -- chat | scheduled | delegated
    model          TEXT,
    user_message   TEXT,
    final_response TEXT,
    status         TEXT NOT NULL DEFAULT 'running', -- running | ok | error | recursion_limit
    error          TEXT
);
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    turn_id     INTEGER REFERENCES turns(id),
    ts          TEXT NOT NULL,
    kind        TEXT NOT NULL,             -- model | tool
    name        TEXT,                      -- model name, or tool name
    tool_call_id TEXT,
    input       TEXT,                      -- tool arguments (JSON)
    content     TEXT,                      -- model reply text, or tool result
    data        TEXT,                      -- JSON: tool_calls, thinking, usage, stop_reason
    status      TEXT,                      -- ok | error
    duration_ms INTEGER,
    truncated   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_turn ON events(turn_id);
CREATE INDEX IF NOT EXISTS idx_turns_started ON turns(started_at);
CREATE INDEX IF NOT EXISTS idx_turns_parent ON turns(parent_turn_id);
CREATE INDEX IF NOT EXISTS idx_events_tool ON events(kind, name);
`;

let db: DatabaseSync | null | undefined;

export function openLogsDb(file = logsDbPath()): DatabaseSync | null {
    if (db !== undefined) return db;
    if (!logsEnabled()) return (db = null);
    try {
        if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
        const d = new DatabaseSync(file);
        d.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
        d.exec(SCHEMA);
        db = d;
    } catch (e: any) {
        console.warn(`[agent-logs] disabled, could not open ${file}: ${e?.message ?? e}`);
        db = null;
    }
    return db;
}

/** Test helper: close and forget the cached connection. */
export function resetLogsDb(): void {
    try {
        db?.close();
    } catch {}
    db = undefined;
}

function safe<T>(fn: () => T): T | undefined {
    try {
        return fn();
    } catch (e: any) {
        console.warn(`[agent-logs] write failed: ${e?.message ?? e}`);
        return undefined;
    }
}

export function cap(text: string | undefined | null, max = Number(process.env.AGENT_LOGS_MAX_CHARS) || DEFAULT_MAX_CHARS): { text: string | null; truncated: boolean } {
    if (text == null) return { text: null, truncated: false };
    return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

const JSON_STRING_CAP = 2000;

/**
 * Serialises `data` to JSON that is ALWAYS valid: cutting the serialised text at `max` (as cap() does for
 * plain text) left unterminated JSON that broke json_extract() in the viewer. When too big, long string
 * values (e.g. a big my_write_file argument) are shortened first; as a last resort only `usage` is kept.
 */
export function capJson(value: unknown, max = Number(process.env.AGENT_LOGS_MAX_CHARS) || DEFAULT_MAX_CHARS): { text: string; truncated: boolean } {
    const full = JSON.stringify(value);
    if (full.length <= max) return { text: full, truncated: false };
    const shrink = (v: unknown): unknown =>
        typeof v === "string" ? (v.length > JSON_STRING_CAP ? v.slice(0, JSON_STRING_CAP) + "…[truncated]" : v)
        : Array.isArray(v) ? v.map(shrink)
        : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shrink(x)]))
        : v;
    const small = JSON.stringify(shrink(value));
    if (small.length <= max) return { text: small, truncated: true };
    const usage = (value as any)?.usage;
    return { text: JSON.stringify({ truncated: true, ...(usage ? { usage } : {}) }), truncated: true };
}

/** Flattens message content to text; images/files become short placeholders (never base64). */
export function contentToText(content: unknown): string {
    if (content == null) return "";
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return JSON.stringify(content);
    return content
        .map((b: any) => {
            if (typeof b === "string") return b;
            if (b?.type === "text") return String(b.text ?? "");
            if (b?.type === "image" || b?.type === "image_url") return `[image ${b.mimeType ?? b.mime_type ?? ""}]`.trim();
            if (b?.type === "thinking" || b?.type === "tool_use") return "";
            return `[${b?.type ?? "block"}]`;
        })
        .filter(Boolean)
        .join("\n");
}

interface TurnContext {
    turnId: number;
}
const turnContext = new AsyncLocalStorage<TurnContext>();

export function currentTurnId(): number | undefined {
    return turnContext.getStore()?.turnId;
}

export interface TurnMeta {
    device?: string;
    chatId?: string;
    threadId?: string;
    agent: string;
    model?: string;
    userMessage: unknown;
}

/**
 * Records one agent run as a turn: inserts the row, runs `fn` with the turn
 * active (so model/tool events attach to it, and nested agent runs link to it
 * as sub-agent turns), then stores the final reply or the error.
 */
// Whether the current agent run is a scheduled task (batch job, higher limits). Kept apart from turnContext
// because it must work even when logging is disabled; sub-agents inherit it from the run that delegated.
const runInfo = new AsyncLocalStorage<{ scheduled: boolean }>();

export function isScheduledRun(): boolean {
    return runInfo.getStore()?.scheduled ?? false;
}

export function loggedTurn(meta: TurnMeta, fn: () => Promise<string>, recursionLimitReply?: string): Promise<string> {
    const scheduled = Boolean(meta.chatId?.startsWith("scheduled:")) || isScheduledRun();
    return runInfo.run({ scheduled }, () => recordTurn(meta, fn, recursionLimitReply));
}

async function recordTurn(meta: TurnMeta, fn: () => Promise<string>, recursionLimitReply?: string): Promise<string> {
    const d = openLogsDb();
    if (!d) return fn();
    const parent = currentTurnId();
    const started = Date.now();
    const source = meta.chatId?.startsWith("scheduled:") ? "scheduled" : parent !== undefined ? "delegated" : "chat";
    const user = cap(contentToText(meta.userMessage)).text;
    const turnId = safe(
        () =>
            Number(
                d
                    .prepare(
                        `INSERT INTO turns (parent_turn_id, started_at, device, chat_id, thread_id, agent, source, model, user_message)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                    )
                    .run(parent ?? null, new Date(started).toISOString(), meta.device ?? null, meta.chatId ?? null, meta.threadId ?? null, meta.agent, source, meta.model ?? null, user).lastInsertRowid
            )
    );
    if (turnId === undefined) return fn();

    const finish = (status: string, response: string | null, error: string | null) =>
        safe(() =>
            d
                .prepare(`UPDATE turns SET ended_at = ?, duration_ms = ?, status = ?, final_response = ?, error = ? WHERE id = ?`)
                .run(new Date().toISOString(), Date.now() - started, status, cap(response).text, error, turnId)
        );
    try {
        const response = await turnContext.run({ turnId }, fn);
        finish(recursionLimitReply !== undefined && response === recursionLimitReply ? "recursion_limit" : "ok", response, null);
        return response;
    } catch (e: any) {
        finish("error", null, String(e?.stack || e?.message || e).slice(0, 5000));
        throw e;
    }
}

export interface EventInput {
    kind: "model" | "tool";
    name?: string;
    toolCallId?: string;
    input?: unknown;
    content?: string | null;
    data?: unknown;
    status?: "ok" | "error";
    durationMs?: number;
}

export function logEvent(e: EventInput): void {
    const d = openLogsDb();
    if (!d) return;
    safe(() => {
        const c = cap(e.content);
        const inp = e.input === undefined ? null : cap(typeof e.input === "string" ? e.input : JSON.stringify(e.input));
        const data = e.data === undefined ? null : capJson(e.data);
        d.prepare(
            `INSERT INTO events (turn_id, ts, kind, name, tool_call_id, input, content, data, status, duration_ms, truncated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            currentTurnId() ?? null,
            new Date().toISOString(),
            e.kind,
            e.name ?? null,
            e.toolCallId ?? null,
            inp ? inp.text : null,
            c.text,
            data ? data.text : null,
            e.status ?? "ok",
            e.durationMs ?? null,
            c.truncated || inp?.truncated || data?.truncated ? 1 : 0
        );
    });
}
