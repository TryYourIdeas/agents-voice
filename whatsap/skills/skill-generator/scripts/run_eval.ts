#!/usr/bin/env npx tsx
/**
 * Run trigger evaluation for a skill description.
 *
 * Tests whether a skill's description causes Claude to trigger (read the skill)
 * for a set of queries. Outputs results as JSON.
 *
 * Usage:
 *   npx tsx scripts/run_eval.ts --eval-set <path> --skill-path <path> [options]
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { parseSkillMd } from "./utils.ts";

// ── Types ─────────────────────────────────────────────────────────────────

interface EvalItem {
  query: string;
  should_trigger: boolean;
}

interface EvalResult {
  query: string;
  should_trigger: boolean;
  trigger_rate: number;
  triggers: number;
  runs: number;
  pass: boolean;
}

export interface EvalOutput {
  skill_name: string;
  description: string;
  results: EvalResult[];
  summary: { total: number; passed: number; failed: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function findProjectRoot(): string {
  let current = process.cwd();
  while (true) {
    if (existsSync(join(current, ".claude"))) return current;
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

async function runSingleQuery(
  query: string,
  skillName: string,
  skillDescription: string,
  timeout: number,
  projectRoot: string,
  model?: string
): Promise<boolean> {
  const uniqueId = randomUUID().slice(0, 8);
  const cleanName = `${skillName}-skill-${uniqueId}`;
  const commandsDir = join(projectRoot, ".claude", "commands");
  const commandFile = join(commandsDir, `${cleanName}.md`);

  try {
    mkdirSync(commandsDir, { recursive: true });

    const indentedDesc = skillDescription.split("\n").join("\n  ");
    const commandContent = [
      "---",
      "description: |",
      `  ${indentedDesc}`,
      "---",
      "",
      `# ${skillName}`,
      "",
      `This skill handles: ${skillDescription}`,
    ].join("\n");
    writeFileSync(commandFile, commandContent);

    const cmd = [
      "claude", "-p", query,
      "--output-format", "stream-json",
      "--verbose", "--include-partial-messages",
    ];
    if (model) cmd.push("--model", model);

    const env = { ...process.env };
    delete (env as any).CLAUDECODE;

    return await new Promise<boolean>((resolveP) => {
      const proc = spawn(cmd[0], cmd.slice(1), {
        cwd: projectRoot,
        env,
        stdio: ["ignore", "pipe", "ignore"],
      });

      let buffer = "";
      let pendingToolName: string | null = null;
      let accumulatedJson = "";
      let resolved = false;

      const finish = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        proc.kill();
        resolveP(result);
      };

      const timer = setTimeout(() => finish(false), timeout * 1000);

      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8");

        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nlIdx).trim();
          buffer = buffer.slice(nlIdx + 1);
          if (!line) continue;

          let event: any;
          try { event = JSON.parse(line); } catch { continue; }

          if (event.type === "stream_event") {
            const se = event.event ?? {};
            const seType = se.type ?? "";

            if (seType === "content_block_start") {
              const cb = se.content_block ?? {};
              if (cb.type === "tool_use") {
                const toolName = cb.name ?? "";
                if (toolName === "Skill" || toolName === "Read") {
                  pendingToolName = toolName;
                  accumulatedJson = "";
                } else {
                  clearTimeout(timer);
                  finish(false);
                  return;
                }
              }
            } else if (seType === "content_block_delta" && pendingToolName) {
              const delta = se.delta ?? {};
              if (delta.type === "input_json_delta") {
                accumulatedJson += delta.partial_json ?? "";
                if (accumulatedJson.includes(cleanName)) {
                  clearTimeout(timer);
                  finish(true);
                  return;
                }
              }
            } else if (seType === "content_block_stop" || seType === "message_stop") {
              if (pendingToolName) {
                clearTimeout(timer);
                finish(accumulatedJson.includes(cleanName));
                return;
              }
              if (seType === "message_stop") {
                clearTimeout(timer);
                finish(false);
                return;
              }
            }
          }

          if (event.type === "assistant") {
            const content = event.message?.content ?? [];
            let triggered = false;
            for (const item of content) {
              if (item.type !== "tool_use") continue;
              if (item.name === "Skill" && (item.input?.skill ?? "").includes(cleanName)) triggered = true;
              if (item.name === "Read" && (item.input?.file_path ?? "").includes(cleanName)) triggered = true;
            }
            clearTimeout(timer);
            finish(triggered);
            return;
          }

          if (event.type === "result") {
            clearTimeout(timer);
            finish(false);
            return;
          }
        }
      });

      proc.on("close", () => { clearTimeout(timer); finish(false); });
      proc.on("error", () => { clearTimeout(timer); finish(false); });
    });
  } finally {
    try { if (existsSync(commandFile)) unlinkSync(commandFile); } catch {}
  }
}

// ── Main eval runner ──────────────────────────────────────────────────────

export async function runEval(opts: {
  evalSet: EvalItem[];
  skillName: string;
  description: string;
  numWorkers: number;
  timeout: number;
  projectRoot: string;
  runsPerQuery?: number;
  triggerThreshold?: number;
  model?: string;
}): Promise<EvalOutput> {
  const {
    evalSet, skillName, description, numWorkers, timeout, projectRoot,
    runsPerQuery = 1, triggerThreshold = 0.5, model,
  } = opts;

  const tasks: Array<{ item: EvalItem; runIdx: number }> = [];
  for (const item of evalSet) {
    for (let r = 0; r < runsPerQuery; r++) tasks.push({ item, runIdx: r });
  }

  // Concurrency limiter
  const queryTriggers = new Map<string, boolean[]>();
  const queryItems = new Map<string, EvalItem>();
  let active = 0;
  const queue: Array<() => void> = [];

  const acquire = () => new Promise<void>((res) => {
    if (active < numWorkers) { active++; res(); } else { queue.push(() => { active++; res(); }); }
  });
  const release = () => { active--; if (queue.length) queue.shift()!(); };

  await Promise.all(
    tasks.map(async ({ item }) => {
      await acquire();
      try {
        const triggered = await runSingleQuery(item.query, skillName, description, timeout, projectRoot, model);
        if (!queryTriggers.has(item.query)) queryTriggers.set(item.query, []);
        queryTriggers.get(item.query)!.push(triggered);
        queryItems.set(item.query, item);
      } catch (e) {
        console.error(`Warning: query failed: ${e}`);
        if (!queryTriggers.has(item.query)) queryTriggers.set(item.query, []);
        queryTriggers.get(item.query)!.push(false);
        queryItems.set(item.query, item);
      } finally { release(); }
    })
  );

  const results: EvalResult[] = [];
  for (const [query, triggers] of queryTriggers) {
    const item = queryItems.get(query)!;
    const rate = triggers.filter(Boolean).length / triggers.length;
    const pass = item.should_trigger ? rate >= triggerThreshold : rate < triggerThreshold;
    results.push({
      query, should_trigger: item.should_trigger, trigger_rate: rate,
      triggers: triggers.filter(Boolean).length, runs: triggers.length, pass,
    });
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    skill_name: skillName, description, results,
    summary: { total: results.length, passed, failed: results.length - passed },
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    options: {
      "eval-set": { type: "string" },
      "skill-path": { type: "string" },
      description: { type: "string" },
      "num-workers": { type: "string", default: "10" },
      timeout: { type: "string", default: "30" },
      "runs-per-query": { type: "string", default: "3" },
      "trigger-threshold": { type: "string", default: "0.5" },
      model: { type: "string" },
      verbose: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (!values["eval-set"] || !values["skill-path"]) {
    console.error("Usage: npx tsx scripts/run_eval.ts --eval-set <path> --skill-path <path>");
    process.exit(1);
  }

  const evalSet: EvalItem[] = JSON.parse(readFileSync(values["eval-set"]!, "utf-8"));
  const skillPath = values["skill-path"]!;

  if (!existsSync(join(skillPath, "SKILL.md"))) {
    console.error(`Error: No SKILL.md found at ${skillPath}`);
    process.exit(1);
  }

  const { name, description: origDesc } = parseSkillMd(skillPath);
  const description = values.description ?? origDesc;

  if (values.verbose) console.error(`Evaluating: ${description}`);

  const output = await runEval({
    evalSet, skillName: name, description,
    numWorkers: parseInt(values["num-workers"]!, 10),
    timeout: parseInt(values.timeout!, 10),
    projectRoot: findProjectRoot(),
    runsPerQuery: parseInt(values["runs-per-query"]!, 10),
    triggerThreshold: parseFloat(values["trigger-threshold"]!),
    model: values.model,
  });

  if (values.verbose) {
    console.error(`Results: ${output.summary.passed}/${output.summary.total} passed`);
    for (const r of output.results) {
      console.error(`  [${r.pass ? "PASS" : "FAIL"}] rate=${r.triggers}/${r.runs} expected=${r.should_trigger}: ${r.query.slice(0, 70)}`);
    }
  }

  console.log(JSON.stringify(output, null, 2));
}

if (process.argv[1]?.endsWith("run_eval.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
