import { describe, it, expect, beforeEach } from "vitest";
import { startReplay, ReplayError } from "./run.ts";
import { openLogsDb, resetLogsDb } from "../agent-logs.ts";

const cfg = { id: 1, name: "lfm", model: "LFM3-1.7B", baseUrl: "http://x", apiKey: "secret" };
let db: ReturnType<typeof openLogsDb> & {};

function seedOriginal(user = "summarize my mail") {
    db.prepare("INSERT INTO turns (started_at, device, agent, source, user_message, status) VALUES ('t','dev1','default','chat',?, 'ok')").run(user);
    const id = Number((db.prepare("SELECT max(id) AS i FROM turns").get() as any).i);
    db.prepare("INSERT INTO events (turn_id, ts, kind, name, input, content, status) VALUES (?, 't', 'tool', 'my_read_file', ?, 'file text', 'ok')").run(id, JSON.stringify({ file_path: "notes.txt" }));
    return id;
}
const deps = (invoke: any) => ({ getConfig: (id: number) => (id === 1 ? cfg : undefined), buildAgent: async () => ({}), invoke });

beforeEach(() => {
    resetLogsDb();
    db = openLogsDb(":memory:")!;
});

describe("startReplay", () => {
    it("creates a turn with replay_of and the config's model as reasoning_model", async () => {
        const orig = seedOriginal();
        const { replayTurnId, done } = await startReplay({ originalTurnId: orig, modelConfigId: 1 }, deps(async () => "answer"));
        await done;
        const t = db.prepare("SELECT replay_of, reasoning_model, agent, device, status, final_response FROM turns WHERE id = ?").get(replayTurnId) as any;
        expect(t).toEqual({ replay_of: orig, reasoning_model: "LFM3-1.7B", agent: "default", device: "dev1", status: "ok", final_response: "answer" });
    });
    it("runs the original user_message and seeds the sandbox from the original events", async () => {
        const orig = seedOriginal("hello there");
        let seen: any;
        const { done } = await startReplay({ originalTurnId: orig, modelConfigId: 1 }, deps(async (ctx: any) => { seen = { message: ctx.message, file: ctx.sandbox.files.get("notes.txt") }; return "ok"; }));
        await done;
        expect(seen).toEqual({ message: "hello there", file: "file text" });
    });
    it("persists the reply and written files into the sandbox tables", async () => {
        const orig = seedOriginal();
        const { replayTurnId, done } = await startReplay({ originalTurnId: orig, modelConfigId: 1 }, deps(async (ctx: any) => { ctx.sandbox.files.set("out.txt", "new"); return "final reply"; }));
        await done;
        expect(db.prepare("SELECT kind, text FROM replay_messages WHERE turn_id = ?").all(replayTurnId)).toEqual([{ kind: "reply", text: "final reply" }]);
        expect(db.prepare("SELECT path, origin FROM replay_files WHERE turn_id = ? ORDER BY path").all(replayTurnId)).toEqual([
            { path: "notes.txt", origin: "seeded" },
            { path: "out.txt", origin: "written" },
        ]);
    });
    it("an unreachable model marks the turn as error and still stores the sandbox", async () => {
        const orig = seedOriginal();
        const { replayTurnId, done } = await startReplay({ originalTurnId: orig, modelConfigId: 1 }, deps(async () => { throw new Error("connect ECONNREFUSED http://x"); }));
        await done.catch(() => {});
        const t = db.prepare("SELECT status, error FROM turns WHERE id = ?").get(replayTurnId) as any;
        expect(t.status).toBe("error");
        expect(t.error).toContain("ECONNREFUSED");
        expect(t.error).not.toContain("secret");
        expect(db.prepare("SELECT count(*) AS n FROM replay_files WHERE turn_id = ?").get(replayTurnId)).toEqual({ n: 1 });
    });
    it("two replays of the same turn have isolated sandboxes", async () => {
        const orig = seedOriginal();
        const mk = (name: string) => startReplay({ originalTurnId: orig, modelConfigId: 1 }, deps(async (ctx: any) => { ctx.sandbox.files.set(name, "x"); return name; }));
        const [a, b] = await Promise.all([mk("a.txt"), mk("b.txt")]);
        await Promise.all([a.done, b.done]);
        expect(db.prepare("SELECT path FROM replay_files WHERE turn_id = ? AND origin='written'").all(a.replayTurnId)).toEqual([{ path: "a.txt" }]);
        expect(db.prepare("SELECT path FROM replay_files WHERE turn_id = ? AND origin='written'").all(b.replayTurnId)).toEqual([{ path: "b.txt" }]);
    });
    it("a replay of a replay uses the replay's own message", async () => {
        const orig = seedOriginal("first");
        const r1 = await startReplay({ originalTurnId: orig, modelConfigId: 1 }, deps(async () => "x"));
        await r1.done;
        let msg = "";
        const r2 = await startReplay({ originalTurnId: r1.replayTurnId, modelConfigId: 1 }, deps(async (c: any) => { msg = c.message; return "y"; }));
        await r2.done;
        expect(msg).toBe("first");
    });
    it("an original without tool events gives an empty sandbox and no throw", async () => {
        db.prepare("INSERT INTO turns (started_at, device, agent, source, user_message) VALUES ('t','dev1','default','chat','hi')").run();
        const id = Number((db.prepare("SELECT max(id) AS i FROM turns").get() as any).i);
        const { done } = await startReplay({ originalTurnId: id, modelConfigId: 1 }, deps(async (c: any) => String(c.sandbox.files.size)));
        await done;
    });
    it("unknown turn or config → ReplayError 404", async () => {
        const orig = seedOriginal();
        await expect(startReplay({ originalTurnId: 999, modelConfigId: 1 }, deps(async () => ""))).rejects.toMatchObject({ status: 404 });
        await expect(startReplay({ originalTurnId: orig, modelConfigId: 42 }, deps(async () => ""))).rejects.toBeInstanceOf(ReplayError);
    });
});
