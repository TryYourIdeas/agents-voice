import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { queuePrompt, runPipeline, slugify } from "./generate-posts.ts";

let root: string;
// Fake pipeline: moves pending -> output/<name>/metadata.json, "publishes" unless --no-post.
const FAKE = `
const fs=require('fs'),path=require('path');
const p=path.join(__dirname,'prompts-post');
for (const f of fs.readdirSync(p+'/pending')) {
  const n=f.replace(/\\.[^.]+$/,'');
  fs.mkdirSync(p+'/output/'+n,{recursive:true});
  fs.writeFileSync(p+'/output/'+n+'/metadata.json',JSON.stringify({title:'T '+n,slug:n+'-1'}));
  fs.writeFileSync(p+'/output/'+n+'/post.md','x');
  fs.renameSync(p+'/pending/'+f,p+'/done/'+f);
  if(!process.argv.includes('--no-post')) console.log('Published article (draft): '+n+'-1');
}
if (process.env.FAIL) { console.error('Error: boom'); process.exit(1); }
`;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "gp-"));
  process.env.GENERATE_POSTS_DIR = root;
  for (const d of ["pending", "in-progress", "done", "output"]) fs.mkdirSync(path.join(root, "prompts-post", d), { recursive: true });
  fs.writeFileSync(path.join(root, "post-with-image.js"), FAKE);
});
afterEach(() => { delete process.env.GENERATE_POSTS_DIR; delete process.env.FAIL; fs.rmSync(root, { recursive: true, force: true }); });

describe("generate-posts bridge", () => {
  it("slugifies names", () => {
    expect(slugify("The `index.md` Hub Pattern!")).toBe("the-index-md-hub-pattern");
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
  });

  it("queues a prompt into pending and rejects bad input", () => {
    const { file, name } = queuePrompt("My Topic", "write a post");
    expect(name).toBe("my-topic");
    expect(fs.readFileSync(file, "utf-8")).toBe("write a post\n");
    expect(() => queuePrompt("x", "   ")).toThrow(/empty/);
    expect(() => queuePrompt("!!!", "a")).toThrow(/Invalid name/);
  });

  it("refuses to queue while other prompts wait (they would be published too)", () => {
    fs.writeFileSync(path.join(root, "prompts-post", "pending", "old.md"), "old");
    expect(() => queuePrompt("new", "a")).toThrow(/old\.md/);
    fs.rmSync(path.join(root, "prompts-post", "pending", "old.md"));
    fs.writeFileSync(path.join(root, "prompts-post", "in-progress", "stuck.md"), "s");
    expect(() => queuePrompt("new", "a")).toThrow(/stuck\.md/);
  });

  it("runs the pipeline, reading title/slug and publish status", async () => {
    queuePrompt("topic", "p");
    const r = await runPipeline({ publish: true });
    expect(r).toMatchObject({ ok: true, published: true, title: "T topic", slug: "topic-1" });
    expect(r.files).toContain("post.md");
  });

  it("passes --no-post when not publishing", async () => {
    queuePrompt("topic", "p");
    expect(await runPipeline({ publish: false })).toMatchObject({ ok: true, published: false });
  });

  it("reports failure and refuses to run with an empty or multi-file queue", async () => {
    await expect(runPipeline({ publish: true })).rejects.toThrow(/No prompt is queued/);
    queuePrompt("topic", "p");
    fs.writeFileSync(path.join(root, "prompts-post", "pending", "extra.md"), "e");
    await expect(runPipeline({ publish: true })).rejects.toThrow(/exactly one/);
    fs.rmSync(path.join(root, "prompts-post", "pending", "extra.md"));
    process.env.FAIL = "1";
    expect(await runPipeline({ publish: true })).toMatchObject({ ok: false, published: false });
  });

  it("fails clearly when the project is not mounted", () => {
    process.env.GENERATE_POSTS_DIR = path.join(root, "missing");
    expect(() => queuePrompt("a", "b")).toThrow(/GENERATE_POSTS_DIR/);
  });
});
