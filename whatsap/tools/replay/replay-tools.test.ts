import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import { tool } from "langchain";
import { z } from "zod";
import { createReplayTools } from "./index.ts";
import { Sandbox } from "../../lib/replay/sandbox.ts";

const real = {
    webSearch: tool(async () => "web", { name: "web_search", description: "d", schema: z.object({}) }),
    fetchUrl: tool(async () => "fetch", { name: "fetch_url", description: "d", schema: z.object({}) }),
    getCurrentDatetime: tool(async () => "now", { name: "get_current_datetime", description: "d", schema: z.object({}) }),
    listAvailableAgents: tool(async () => "- mail: reads mail", { name: "list_available_agents", description: "d", schema: z.object({}) }),
};
function setup() {
    const sb = new Sandbox();
    const tools = createReplayTools(sb, real as any);
    const call = (name: string, args: any) => {
        const t = tools.find((x: any) => x.name === name);
        if (!t) throw new Error(`no tool ${name}`);
        return (t as any).invoke(args);
    };
    return { sb, tools, call };
}

describe("replay file tools", () => {
    it("write then read returns content", async () => {
        const { call } = setup();
        await call("my_write_file", { file_path: "a/b.txt", content: "hi" });
        expect(await call("my_read_file", { file_path: "a/b.txt" })).toBe("hi");
    });
    it("reads from an offset", async () => {
        const { sb, call } = setup();
        sb.files.set("a.txt", "abcdef");
        expect(await call("my_read_file", { file_path: "a.txt", offset: 3 })).toBe("def");
    });
    it("read of a missing file returns an error string", async () => {
        const { call } = setup();
        expect(await call("my_read_file", { file_path: "nope.txt" })).toMatch(/not exist|not found/i);
    });
    it("lists seeded and written files directly under a directory", async () => {
        const { sb, call } = setup();
        sb.files.set("docs/a.txt", "1");
        await call("my_write_file", { file_path: "docs/sub/b.txt", content: "2" });
        await call("my_write_file", { file_path: "top.txt", content: "3" });
        expect(await call("list_directory", { directoryPath: "docs" })).toEqual(expect.stringContaining("a.txt"));
        const out = JSON.parse(await call("list_directory", { directoryPath: "docs" }));
        expect(out).toEqual(["a.txt", "sub"]);
    });
    it("check_directory_exists and create_directory work on the sandbox", async () => {
        const { call } = setup();
        expect(await call("check_directory_exists", { directoryPath: "x" })).toMatch(/not a directory/);
        await call("create_directory", { directoryPath: "x" });
        expect(await call("check_directory_exists", { directoryPath: "x" })).toMatch(/is a directory/);
    });
    it("../ and absolute paths are rejected and the real disk is untouched", async () => {
        const { call } = setup();
        const spy = vi.spyOn(fs, "writeFileSync");
        expect(await call("my_write_file", { file_path: "../evil.txt", content: "x" })).toMatch(/escapes|relative/i);
        expect(await call("my_read_file", { file_path: "/etc/passwd" })).toMatch(/relative/i);
        expect(spy).not.toHaveBeenCalled();
        expect(fs.existsSync("../evil.txt")).toBe(false);
    });
    it("download_file stores a placeholder instead of fetching", async () => {
        const { sb, call } = setup();
        const f = vi.spyOn(globalThis, "fetch");
        await call("download_file", { url: "https://example.com/a.pdf", destination_path: "a.pdf" });
        expect(f).not.toHaveBeenCalled();
        expect(sb.files.get("a.pdf")).toMatch(/sandbox/i);
    });
});

describe("replay mail, chat and other tools", () => {
    it("yahoo_get_new_emails returns the inbox, or the empty notice", async () => {
        const { sb, call } = setup();
        expect(await call("yahoo_get_new_emails", {})).toBe("No new (unread) emails.");
        sb.inbox.push({ uid: 3, from: "a@b", to: "me", subject: "S", body: "B" });
        expect(JSON.parse(await call("yahoo_get_new_emails", {}))[0]).toMatchObject({ uid: 3, subject: "S" });
    });
    it("yahoo_draft_email appends to sent and says it was sent in the sandbox", async () => {
        const { sb, call } = setup();
        sb.inbox.push({ uid: 3, from: "a@b", to: "me", subject: "S", body: "B" });
        const out = await call("yahoo_draft_email", { body: "Thanks", reply_to_uid: 3 });
        expect(out).toMatch(/sandbox/i);
        expect(sb.sent).toHaveLength(1);
        expect(sb.sent[0]).toMatchObject({ to: "a@b", subject: "Re: S", body: "Thanks", inReplyToUid: 3 });
    });
    it("send_audio appends an audio message", async () => {
        const { sb, call } = setup();
        await call("send_audio", { text: "hello" });
        expect(sb.messages[0]).toMatchObject({ kind: "audio", text: "hello" });
    });
    it("post_queue_prompt stores the prompt in the sandbox and post_run_pipeline is disabled", async () => {
        const { sb, call } = setup();
        expect(await call("post_queue_prompt", { name: "ai news", prompt: "write about X" })).toMatch(/Queued/);
        expect(sb.files.get("generate-posts/pending/ai news.md")).toBe("write about X");
        expect(await call("post_run_pipeline", {})).toMatch(/disabled in replay/i);
    });
    it("scheduled-task tools answer 'disabled in replay'", async () => {
        const { call } = setup();
        expect(await call("list_scheduled_tasks", {})).toMatch(/disabled in replay/i);
        expect(await call("cancel_scheduled_task", { name: "x" })).toMatch(/disabled in replay/i);
        expect(await call("create_scheduled_task", { description: "d", scheduleType: "once", schedule: "2030-01-01T00:00:00Z", targetAgent: "default", destinationChat: "c", body: "b" })).toMatch(/disabled in replay/i);
    });
    it("the tool list has no execute_bash and keeps the real network tools", () => {
        const { tools } = setup();
        const names = tools.map((t: any) => t.name);
        expect(names).not.toContain("execute_bash");
        expect(names).toEqual(expect.arrayContaining(["web_search", "fetch_url", "get_current_datetime", "get_current_chat", "render_diagram", "list_available_agents", "post_queue_prompt", "post_run_pipeline"]));
        expect(new Set(names).size).toBe(names.length);
    });
});

describe("replayResearchSink", () => {
    it("stores web-search results in the sandbox instead of the device directory", async () => {
        const { replayResearchSink } = await import("./web-search.ts");
        const sb = new Sandbox();
        const sink = replayResearchSink(sb);
        sink({ query: "q", topic: "general" }, { results: [] });
        const paths = [...sb.files.keys()];
        expect(paths.some((p) => p.startsWith("research/") && p.endsWith("_results.json"))).toBe(true);
        expect(paths.some((p) => p.endsWith("_query.json"))).toBe(true);
    });
});
