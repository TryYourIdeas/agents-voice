// Bridge to the sibling `generate-posts` project (web/generate-posts): queues a raw
// prompt in its prompts-post/pending/ folder and runs its post-with-image.js pipeline
// (write post -> humanize -> metadata -> image -> publish as a DRAFT article).
// The pipeline processes the WHOLE pending queue, so we refuse to queue or run while
// anything else is waiting - otherwise an unrelated old prompt would be generated and
// published by accident.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const MAX_PROMPT_CHARS = 20_000;
export const RUN_TIMEOUT_MS = Number(process.env.GENERATE_POSTS_TIMEOUT_MS) || 25 * 60_000;
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OUTPUT_TAIL_CHARS = 3000;

let running = false;

export function generatePostsDir(): string {
  return path.resolve(process.env.GENERATE_POSTS_DIR || "../generate-posts");
}

const dirs = (root = generatePostsDir()) => ({
  root,
  pending: path.join(root, "prompts-post", "pending"),
  inProgress: path.join(root, "prompts-post", "in-progress"),
  output: path.join(root, "prompts-post", "output"),
});

const listFiles = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith(".")) : [];

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

function assertInstalled(root: string) {
  if (!fs.existsSync(path.join(root, "post-with-image.js"))) {
    throw new Error(
      `generate-posts project not found at ${root}. Set GENERATE_POSTS_DIR (in Docker, mount it at /data/generate-posts).`,
    );
  }
}

/** Writes prompts-post/pending/<name>.md. Refuses if any other prompt is queued or interrupted. */
export function queuePrompt(rawName: string, prompt: string): { name: string; file: string } {
  const root = generatePostsDir();
  assertInstalled(root);
  const name = slugify(rawName);
  if (!NAME_RE.test(name)) throw new Error("Invalid name: use a few words, e.g. 'index-md-hub-pattern'.");
  const text = prompt.trim();
  if (!text) throw new Error("The prompt is empty.");
  if (text.length > MAX_PROMPT_CHARS) throw new Error(`The prompt is too long (max ${MAX_PROMPT_CHARS} characters).`);

  const d = dirs(root);
  const others = [...listFiles(d.pending), ...listFiles(d.inProgress)].filter((f) => f !== `${name}.md`);
  if (others.length) {
    throw new Error(
      `Other prompts are already waiting in generate-posts (${others.join(", ")}); the pipeline would process them too. Ask the user to clear or run them first.`,
    );
  }
  fs.mkdirSync(d.pending, { recursive: true });
  const file = path.join(d.pending, `${name}.md`);
  fs.writeFileSync(file, text + "\n", "utf-8");
  return { name, file };
}

export interface RunResult {
  ok: boolean;
  published: boolean;
  outputDir: string | null;
  title?: string;
  slug?: string;
  files: string[];
  logTail: string;
}

/** Runs `node post-with-image.js [--no-post]` for the single queued prompt. */
export async function runPipeline(opts: { publish: boolean }): Promise<RunResult> {
  const root = generatePostsDir();
  assertInstalled(root);
  const d = dirs(root);
  const queued = [...listFiles(d.pending), ...listFiles(d.inProgress)];
  if (queued.length !== 1) {
    throw new Error(
      queued.length === 0
        ? "No prompt is queued. Call post_queue_prompt first."
        : `Expected exactly one queued prompt but found ${queued.length} (${queued.join(", ")}); refusing to run.`,
    );
  }
  if (running) throw new Error("A post generation is already running. Wait for it to finish.");
  running = true;
  const outName = queued[0].replace(/\.[^.]+$/, "");
  const args = ["post-with-image.js", ...(opts.publish ? [] : ["--no-post"])];
  try {
    const { code, log } = await new Promise<{ code: number | null; log: string }>((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, env: process.env });
      let log = "";
      const add = (b: Buffer) => { log = (log + b.toString()).slice(-50_000); };
      child.stdout.on("data", add);
      child.stderr.on("data", add);
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Timed out after ${Math.round(RUN_TIMEOUT_MS / 60000)} min.`)); }, RUN_TIMEOUT_MS);
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.on("close", (c) => { clearTimeout(timer); resolve({ code: c, log }); });
    });

    const outputDir = path.join(d.output, outName);
    const hasOutput = fs.existsSync(outputDir);
    let title: string | undefined;
    let slug: string | undefined;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(outputDir, "metadata.json"), "utf-8"));
      title = meta.title;
      slug = meta.slug;
    } catch { /* no metadata yet */ }
    return {
      ok: code === 0,
      published: code === 0 && opts.publish && /Published article \(draft\)/.test(log),
      outputDir: hasOutput ? outputDir : null,
      title,
      slug,
      files: hasOutput ? listFiles(outputDir) : [],
      logTail: log.slice(-OUTPUT_TAIL_CHARS),
    };
  } finally {
    running = false;
  }
}
