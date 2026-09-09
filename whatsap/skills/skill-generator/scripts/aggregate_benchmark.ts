#!/usr/bin/env npx tsx
/**
 * Aggregate individual run results into benchmark summary statistics.
 *
 * Reads grading.json files from run directories and produces benchmark.json
 * and benchmark.md with mean, stddev, min, max for pass_rate, time, and tokens.
 *
 * Usage:
 *   npx tsx scripts/aggregate_benchmark.ts <benchmark_dir> [--skill-name <n>]
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

interface Stats { mean: number; stddev: number; min: number; max: number; }

interface RunResult {
  eval_id: number; run_number: number;
  pass_rate: number; passed: number; failed: number; total: number;
  time_seconds: number; tokens: number; tool_calls: number; errors: number;
  expectations: any[]; notes: string[];
}

function calcStats(values: number[]): Stats {
  if (!values.length) return { mean: 0, stddev: 0, min: 0, max: 0 };
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return { mean: r(mean), stddev: r(Math.sqrt(variance)), min: r(Math.min(...values)), max: r(Math.max(...values)) };
}

function sortedDirs(parent: string, pattern: RegExp): string[] {
  if (!existsSync(parent)) return [];
  return readdirSync(parent).filter((d) => pattern.test(d) && statSync(join(parent, d)).isDirectory()).sort();
}

function readJson(path: string): any | null {
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

function loadRunResults(benchmarkDir: string): Record<string, RunResult[]> {
  let searchDir = join(benchmarkDir, "runs");
  if (!existsSync(searchDir)) {
    if (sortedDirs(benchmarkDir, /^eval-/).length > 0) searchDir = benchmarkDir;
    else { console.log(`No eval directories found in ${benchmarkDir}`); return {}; }
  }

  const results: Record<string, RunResult[]> = {};
  for (const [idx, evalDirName] of sortedDirs(searchDir, /^eval-/).entries()) {
    const evalDir = join(searchDir, evalDirName);
    let evalId = idx;
    const meta = readJson(join(evalDir, "eval_metadata.json"));
    if (meta?.eval_id != null) evalId = meta.eval_id;
    else { const p = parseInt(evalDirName.split("-")[1], 10); if (!isNaN(p)) evalId = p; }

    for (const configName of sortedDirs(evalDir, /./)) {
      const configDir = join(evalDir, configName);
      const runDirs = sortedDirs(configDir, /^run-/);
      if (!runDirs.length) continue;
      if (!results[configName]) results[configName] = [];

      for (const runDirName of runDirs) {
        const runDir = join(configDir, runDirName);
        const runNum = parseInt(runDirName.split("-")[1], 10);
        const grading = readJson(join(runDir, "grading.json"));
        if (!grading) { console.log(`Warning: no grading.json in ${runDir}`); continue; }

        const summary = grading.summary ?? {};
        const result: RunResult = {
          eval_id: evalId, run_number: runNum,
          pass_rate: summary.pass_rate ?? 0, passed: summary.passed ?? 0,
          failed: summary.failed ?? 0, total: summary.total ?? 0,
          time_seconds: 0, tokens: 0, tool_calls: 0, errors: 0,
          expectations: grading.expectations ?? [], notes: [],
        };

        const timing = grading.timing ?? {};
        result.time_seconds = timing.total_duration_seconds ?? 0;
        if (result.time_seconds === 0) {
          const td = readJson(join(runDir, "timing.json"));
          if (td) { result.time_seconds = td.total_duration_seconds ?? 0; result.tokens = td.total_tokens ?? 0; }
        }

        const metrics = grading.execution_metrics ?? {};
        result.tool_calls = metrics.total_tool_calls ?? 0;
        if (!result.tokens) result.tokens = metrics.output_chars ?? 0;
        result.errors = metrics.errors_encountered ?? 0;

        const ns = grading.user_notes_summary ?? {};
        result.notes = [...(ns.uncertainties ?? []), ...(ns.needs_review ?? []), ...(ns.workarounds ?? [])];
        results[configName].push(result);
      }
    }
  }
  return results;
}

export function generateBenchmark(benchmarkDir: string, skillName = "", skillPath = ""): any {
  const results = loadRunResults(benchmarkDir);
  const configs = Object.keys(results);
  const runSummary: Record<string, any> = {};

  for (const config of configs) {
    const runs = results[config] ?? [];
    runSummary[config] = runs.length ? {
      pass_rate: calcStats(runs.map((r) => r.pass_rate)),
      time_seconds: calcStats(runs.map((r) => r.time_seconds)),
      tokens: calcStats(runs.map((r) => r.tokens)),
    } : {
      pass_rate: { mean: 0, stddev: 0, min: 0, max: 0 },
      time_seconds: { mean: 0, stddev: 0, min: 0, max: 0 },
      tokens: { mean: 0, stddev: 0, min: 0, max: 0 },
    };
  }

  const p = configs[0] ? runSummary[configs[0]] : {};
  const b = configs[1] ? runSummary[configs[1]] : {};
  const dPR = (p.pass_rate?.mean ?? 0) - (b.pass_rate?.mean ?? 0);
  const dT = (p.time_seconds?.mean ?? 0) - (b.time_seconds?.mean ?? 0);
  const dTk = (p.tokens?.mean ?? 0) - (b.tokens?.mean ?? 0);
  runSummary.delta = {
    pass_rate: `${dPR >= 0 ? "+" : ""}${dPR.toFixed(2)}`,
    time_seconds: `${dT >= 0 ? "+" : ""}${dT.toFixed(1)}`,
    tokens: `${dTk >= 0 ? "+" : ""}${Math.round(dTk)}`,
  };

  const runs: any[] = [];
  for (const config of configs) {
    for (const r of results[config]) {
      runs.push({
        eval_id: r.eval_id, configuration: config, run_number: r.run_number,
        result: { pass_rate: r.pass_rate, passed: r.passed, failed: r.failed, total: r.total, time_seconds: r.time_seconds, tokens: r.tokens, tool_calls: r.tool_calls, errors: r.errors },
        expectations: r.expectations, notes: r.notes,
      });
    }
  }

  const evalIds = [...new Set(Object.values(results).flat().map((r) => r.eval_id))].sort((a, b) => a - b);
  return {
    metadata: { skill_name: skillName || "<skill-name>", skill_path: skillPath || "<path>", executor_model: "<model>", analyzer_model: "<model>", timestamp: new Date().toISOString(), evals_run: evalIds, runs_per_configuration: 3 },
    runs, run_summary: runSummary, notes: [],
  };
}

export function generateMarkdown(benchmark: any): string {
  const { metadata, run_summary: rs } = benchmark;
  const configs = Object.keys(rs).filter((k) => k !== "delta");
  const cap = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
  const a = rs[configs[0]] ?? {}, b = rs[configs[1]] ?? {}, d = rs.delta ?? {};
  const aPR = a.pass_rate ?? {}, bPR = b.pass_rate ?? {};
  const aT = a.time_seconds ?? {}, bT = b.time_seconds ?? {};
  const aTk = a.tokens ?? {}, bTk = b.tokens ?? {};

  return [
    `# Skill Benchmark: ${metadata.skill_name}`, "",
    `**Model**: ${metadata.executor_model}`, `**Date**: ${metadata.timestamp}`,
    `**Evals**: ${metadata.evals_run.join(", ")} (${metadata.runs_per_configuration} runs each)`, "",
    "## Summary", "",
    `| Metric | ${cap(configs[0] ?? "")} | ${cap(configs[1] ?? "")} | Delta |`,
    "|--------|------------|---------------|-------|",
    `| Pass Rate | ${((aPR.mean ?? 0) * 100).toFixed(0)}% ± ${((aPR.stddev ?? 0) * 100).toFixed(0)}% | ${((bPR.mean ?? 0) * 100).toFixed(0)}% ± ${((bPR.stddev ?? 0) * 100).toFixed(0)}% | ${d.pass_rate ?? "—"} |`,
    `| Time | ${(aT.mean ?? 0).toFixed(1)}s ± ${(aT.stddev ?? 0).toFixed(1)}s | ${(bT.mean ?? 0).toFixed(1)}s ± ${(bT.stddev ?? 0).toFixed(1)}s | ${d.time_seconds ?? "—"}s |`,
    `| Tokens | ${(aTk.mean ?? 0).toFixed(0)} ± ${(aTk.stddev ?? 0).toFixed(0)} | ${(bTk.mean ?? 0).toFixed(0)} ± ${(bTk.stddev ?? 0).toFixed(0)} | ${d.tokens ?? "—"} |`,
    ...(benchmark.notes?.length ? ["", "## Notes", "", ...benchmark.notes.map((n: string) => `- ${n}`)] : []),
  ].join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("aggregate_benchmark.ts")) {
  const { values, positionals } = parseArgs({
    options: { "skill-name": { type: "string", default: "" }, "skill-path": { type: "string", default: "" }, output: { type: "string", short: "o" } },
    allowPositionals: true, strict: true,
  });
  if (!positionals.length) { console.error("Usage: npx tsx scripts/aggregate_benchmark.ts <benchmark_dir>"); process.exit(1); }
  if (!existsSync(positionals[0])) { console.error(`Not found: ${positionals[0]}`); process.exit(1); }

  const bm = generateBenchmark(positionals[0], values["skill-name"], values["skill-path"]);
  const outJson = values.output ?? join(positionals[0], "benchmark.json");
  const outMd = outJson.replace(/\.json$/, ".md");
  writeFileSync(outJson, JSON.stringify(bm, null, 2));
  writeFileSync(outMd, generateMarkdown(bm));
  console.log(`Generated: ${outJson}\nGenerated: ${outMd}`);

  const cfgs = Object.keys(bm.run_summary).filter((k: string) => k !== "delta");
  console.log("\nSummary:");
  for (const c of cfgs) console.log(`  ${c.replace(/_/g, " ")}: ${((bm.run_summary[c]?.pass_rate?.mean ?? 0) * 100).toFixed(1)}% pass rate`);
  console.log(`  Delta: ${bm.run_summary.delta?.pass_rate ?? "—"}`);
}
