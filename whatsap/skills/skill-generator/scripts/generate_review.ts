#!/usr/bin/env npx tsx
/**
 * Generate and serve a review page for eval results.
 *
 * Reads the workspace directory, discovers runs (directories with outputs/),
 * embeds all output data into a self-contained HTML page, and either serves
 * it via a tiny HTTP server or writes a static HTML file.
 *
 * Usage:
 *   npx tsx eval-viewer/generate_review.ts <workspace-path> [--port PORT] [--skill-name NAME]
 *   npx tsx eval-viewer/generate_review.ts <workspace-path> --static output.html
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const METADATA_FILES = new Set(["transcript.md", "user_notes.md", "metrics.json"]);
const TEXT_EXTS = new Set([".txt",".md",".json",".csv",".py",".js",".ts",".tsx",".jsx",".yaml",".yml",".xml",".html",".css",".sh",".rb",".go",".rs",".java",".c",".cpp",".h",".sql",".toml"]);
const IMAGE_EXTS = new Set([".png",".jpg",".jpeg",".gif",".svg",".webp"]);

function ext(name: string): string { const d = name.lastIndexOf("."); return d >= 0 ? name.slice(d).toLowerCase() : ""; }
function mime(e: string): string {
  const m: Record<string,string> = {".svg":"image/svg+xml",".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".webp":"image/webp",".pdf":"application/pdf"};
  return m[e] ?? "application/octet-stream";
}
function readJson(p: string): any { try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; } }

function embedFile(fp: string): Record<string,any> {
  const name = fp.split("/").pop()!, e = ext(name), m = mime(e);
  if (TEXT_EXTS.has(e)) { try { return { name, type: "text", content: readFileSync(fp, "utf-8") }; } catch { return { name, type: "error", content: "(Error)" }; } }
  if (IMAGE_EXTS.has(e)) { try { return { name, type: "image", mime: m, data_uri: `data:${m};base64,${readFileSync(fp).toString("base64")}` }; } catch { return { name, type: "error", content: "(Error)" }; } }
  if (e === ".pdf") { try { return { name, type: "pdf", data_uri: `data:${m};base64,${readFileSync(fp).toString("base64")}` }; } catch { return { name, type: "error", content: "(Error)" }; } }
  if (e === ".xlsx") { try { return { name, type: "xlsx", data_b64: readFileSync(fp).toString("base64") }; } catch { return { name, type: "error", content: "(Error)" }; } }
  try { return { name, type: "binary", mime: m, data_uri: `data:${m};base64,${readFileSync(fp).toString("base64")}` }; } catch { return { name, type: "error", content: "(Error)" }; }
}

interface RunData { id: string; prompt: string; eval_id: number | null; outputs: any[]; grading: any; }

function findRuns(ws: string): RunData[] {
  const runs: RunData[] = [];
  const walk = (root: string, cur: string) => {
    if (!statSync(cur).isDirectory()) return;
    const od = join(cur, "outputs");
    if (existsSync(od) && statSync(od).isDirectory()) {
      let prompt = "", evalId: number | null = null;
      for (const c of [join(cur, "eval_metadata.json"), join(dirname(cur), "eval_metadata.json")]) {
        const m = readJson(c); if (m) { prompt = m.prompt ?? ""; evalId = m.eval_id ?? null; } if (prompt) break;
      }
      if (!prompt) {
        for (const c of [join(cur, "transcript.md"), join(od, "transcript.md")]) {
          if (existsSync(c)) { const t = readFileSync(c, "utf-8"); const match = t.match(/## Eval Prompt\n\n([\s\S]*?)(?=\n##|$)/); if (match) prompt = match[1].trim(); } if (prompt) break;
        }
      }
      const outputs: any[] = [];
      if (existsSync(od)) for (const f of readdirSync(od).sort()) { const p = join(od, f); if (statSync(p).isFile() && !METADATA_FILES.has(f)) outputs.push(embedFile(p)); }
      let grading = null;
      for (const c of [join(cur, "grading.json"), join(dirname(cur), "grading.json")]) { grading = readJson(c); if (grading) break; }
      runs.push({ id: relative(root, cur).replace(/[/\\]/g, "-"), prompt: prompt || "(No prompt found)", eval_id: evalId, outputs, grading });
      return;
    }
    const skip = new Set(["node_modules", ".git", "__pycache__", "skill", "inputs"]);
    for (const ch of readdirSync(cur).sort()) { const cp = join(cur, ch); if (statSync(cp).isDirectory() && !skip.has(ch)) walk(root, cp); }
  };
  walk(ws, ws);
  runs.sort((a, b) => (a.eval_id ?? Infinity) - (b.eval_id ?? Infinity) || a.id.localeCompare(b.id));
  return runs;
}

function loadPrevious(ws: string): Record<string, { feedback: string; outputs: any[] }> {
  const result: Record<string, { feedback: string; outputs: any[] }> = {};
  const fbMap: Record<string, string> = {};
  const fbPath = join(ws, "feedback.json");
  if (existsSync(fbPath)) { const d = readJson(fbPath); if (d?.reviews) for (const r of d.reviews) if (r.feedback?.trim()) fbMap[r.run_id] = r.feedback; }
  for (const run of findRuns(ws)) result[run.id] = { feedback: fbMap[run.id] ?? "", outputs: run.outputs };
  for (const [id, fb] of Object.entries(fbMap)) if (!(id in result)) result[id] = { feedback: fb, outputs: [] };
  return result;
}

function generateReviewHtml(runs: RunData[], skillName: string, previous?: Record<string,any> | null, benchmark?: any): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const template = readFileSync(join(__dirname, "viewer.html"), "utf-8");
  const pf: Record<string,string> = {}, po: Record<string,any[]> = {};
  if (previous) for (const [id, d] of Object.entries(previous)) { if (d.feedback) pf[id] = d.feedback; if (d.outputs?.length) po[id] = d.outputs; }
  const embedded: any = { skill_name: skillName, runs, previous_feedback: pf, previous_outputs: po };
  if (benchmark) embedded.benchmark = benchmark;
  return template.replace("/*__EMBEDDED_DATA__*/", `const EMBEDDED_DATA = ${JSON.stringify(embedded)};`);
}

// ── CLI + Server ─────────────────────────────────────────────────

function main() {
  const { values, positionals } = parseArgs({
    options: {
      port: { type: "string", short: "p", default: "3117" },
      "skill-name": { type: "string", short: "n" },
      "previous-workspace": { type: "string" },
      benchmark: { type: "string" },
      static: { type: "string", short: "s" },
    },
    allowPositionals: true, strict: true,
  });

  if (!positionals.length) { console.error("Usage: npx tsx eval-viewer/generate_review.ts <workspace>"); process.exit(1); }
  const ws = resolve(positionals[0]);
  if (!existsSync(ws) || !statSync(ws).isDirectory()) { console.error(`Error: ${ws} is not a directory`); process.exit(1); }

  const runs = findRuns(ws);
  if (!runs.length) { console.error(`No runs found in ${ws}`); process.exit(1); }

  const skillName = values["skill-name"] ?? ws.split("/").pop()!.replace(/-workspace$/, "");
  const feedbackPath = join(ws, "feedback.json");
  const previous = values["previous-workspace"] ? loadPrevious(resolve(values["previous-workspace"])) : {};
  const bmPath = values.benchmark ? resolve(values.benchmark) : undefined;

  if (values.static) {
    const bm = bmPath && existsSync(bmPath) ? readJson(bmPath) : null;
    const html = generateReviewHtml(runs, skillName, previous, bm);
    const out = resolve(values.static);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    console.log(`\n  Static viewer written to: ${out}\n`);
    process.exit(0);
  }

  const port = parseInt(values.port!, 10);
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      const bm = bmPath && existsSync(bmPath) ? readJson(bmPath) : null;
      const html = generateReviewHtml(findRuns(ws), skillName, previous, bm);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } else if (req.method === "GET" && req.url === "/api/feedback") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(existsSync(feedbackPath) ? readFileSync(feedbackPath, "utf-8") : "{}");
    } else if (req.method === "POST" && req.url === "/api/feedback") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const d = JSON.parse(body);
          if (!d.reviews) throw new Error("Missing reviews");
          writeFileSync(feedbackPath, JSON.stringify(d, null, 2) + "\n");
          res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}');
        } catch (e: any) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
      });
    } else { res.writeHead(404); res.end("Not Found"); }
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  Eval Viewer\n  ${"─".repeat(35)}\n  URL:       ${url}\n  Workspace: ${ws}\n  Feedback:  ${feedbackPath}\n\n  Press Ctrl+C to stop.\n`);
    try { execSync(`${process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"} "${url}"`, { stdio: "ignore" }); } catch {}
  });
  process.on("SIGINT", () => { console.log("\nStopped."); server.close(); process.exit(0); });
}

if (process.argv[1]?.endsWith("generate_review.ts")) main();
