#!/usr/bin/env npx tsx
/**
 * Run the eval + improve loop until all pass or max iterations reached.
 *
 * Combines run_eval.ts and improve_description.ts in a loop, tracking history
 * and returning the best description found. Supports train/test split.
 *
 * Usage:
 *   npx tsx scripts/run_loop.ts --eval-set <path> --skill-path <path> --model <model> [options]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { runEval } from "./run_eval.ts";
import { improveDescription } from "./improve_description.ts";
import { generateHtml } from "./generate_report.ts";
import { parseSkillMd } from "./utils.ts";

interface EvalItem { query: string; should_trigger: boolean; }

function splitEvalSet(evalSet: EvalItem[], holdout: number, seed = 42): [EvalItem[], EvalItem[]] {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const shuffle = <T>(arr: T[]) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } };

  const trigger = evalSet.filter((e) => e.should_trigger);
  const noTrigger = evalSet.filter((e) => !e.should_trigger);
  shuffle(trigger); shuffle(noTrigger);

  const nTT = Math.max(1, Math.floor(trigger.length * holdout));
  const nNT = Math.max(1, Math.floor(noTrigger.length * holdout));
  return [
    [...trigger.slice(nTT), ...noTrigger.slice(nNT)],
    [...trigger.slice(0, nTT), ...noTrigger.slice(0, nNT)],
  ];
}

function findProjectRoot(): string {
  let cur = process.cwd();
  while (true) {
    if (existsSync(join(cur, ".claude"))) return cur;
    const p = resolve(cur, "..");
    if (p === cur) break;
    cur = p;
  }
  return process.cwd();
}

async function runLoop(opts: {
  evalSet: EvalItem[]; skillPath: string; descriptionOverride?: string;
  numWorkers: number; timeout: number; maxIterations: number;
  runsPerQuery: number; triggerThreshold: number; holdout: number;
  model: string; verbose: boolean; liveReportPath?: string; logDir?: string;
}): Promise<any> {
  const projectRoot = findProjectRoot();
  const { name, description: origDesc, content } = parseSkillMd(opts.skillPath);
  let currentDesc = opts.descriptionOverride ?? origDesc;

  let trainSet: EvalItem[], testSet: EvalItem[];
  if (opts.holdout > 0) {
    [trainSet, testSet] = splitEvalSet(opts.evalSet, opts.holdout);
    if (opts.verbose) console.error(`Split: ${trainSet.length} train, ${testSet.length} test`);
  } else {
    trainSet = opts.evalSet; testSet = [];
  }

  const history: any[] = [];
  let exitReason = "unknown";

  for (let iter = 1; iter <= opts.maxIterations; iter++) {
    if (opts.verbose) {
      console.error(`\n${"=".repeat(60)}\nIteration ${iter}/${opts.maxIterations}\nDescription: ${currentDesc}\n${"=".repeat(60)}`);
    }

    const t0 = Date.now();
    const allResults = await runEval({
      evalSet: [...trainSet, ...testSet], skillName: name, description: currentDesc,
      numWorkers: opts.numWorkers, timeout: opts.timeout, projectRoot,
      runsPerQuery: opts.runsPerQuery, triggerThreshold: opts.triggerThreshold, model: opts.model,
    });
    const elapsed = (Date.now() - t0) / 1000;

    const trainQs = new Set(trainSet.map((q) => q.query));
    const trainRL = allResults.results.filter((r) => trainQs.has(r.query));
    const testRL = allResults.results.filter((r) => !trainQs.has(r.query));

    const trainP = trainRL.filter((r) => r.pass).length;
    const trainSum = { passed: trainP, failed: trainRL.length - trainP, total: trainRL.length };
    const trainRes = { results: trainRL, summary: trainSum };

    let testSum: any = null, testRes: any = null;
    if (testSet.length) {
      const testP = testRL.filter((r) => r.pass).length;
      testSum = { passed: testP, failed: testRL.length - testP, total: testRL.length };
      testRes = { results: testRL, summary: testSum };
    }

    history.push({
      iteration: iter, description: currentDesc,
      train_passed: trainSum.passed, train_failed: trainSum.failed, train_total: trainSum.total, train_results: trainRL,
      test_passed: testSum?.passed ?? null, test_failed: testSum?.failed ?? null, test_total: testSum?.total ?? null, test_results: testRes?.results ?? null,
      passed: trainSum.passed, failed: trainSum.failed, total: trainSum.total, results: trainRL,
    });

    if (opts.liveReportPath) {
      writeFileSync(opts.liveReportPath, generateHtml({
        original_description: origDesc, best_description: currentDesc, best_score: "in progress",
        iterations_run: history.length, holdout: opts.holdout, train_size: trainSet.length, test_size: testSet.length, history,
      }, { autoRefresh: true, skillName: name }));
    }

    if (opts.verbose) {
      const show = (label: string, results: any[]) => {
        const pos = results.filter((r: any) => r.should_trigger), neg = results.filter((r: any) => !r.should_trigger);
        const tp = pos.reduce((s: number, r: any) => s + r.triggers, 0), posR = pos.reduce((s: number, r: any) => s + r.runs, 0);
        const fp = neg.reduce((s: number, r: any) => s + r.triggers, 0), negR = neg.reduce((s: number, r: any) => s + r.runs, 0);
        const tn = negR - fp, total = tp + tn + fp + (posR - tp);
        console.error(`${label}: ${tp + tn}/${total} correct (${elapsed.toFixed(1)}s)`);
        for (const r of results) console.error(`  [${r.pass ? "PASS" : "FAIL"}] ${r.triggers}/${r.runs} expected=${r.should_trigger}: ${r.query.slice(0, 60)}`);
      };
      show("Train", trainRL);
      if (testSum) show("Test ", testRL);
    }

    if (trainSum.failed === 0) { exitReason = `all_passed (iteration ${iter})`; if (opts.verbose) console.error(`\nAll passed at iteration ${iter}!`); break; }
    if (iter === opts.maxIterations) { exitReason = `max_iterations (${opts.maxIterations})`; break; }

    if (opts.verbose) console.error("\nImproving description...");
    const t1 = Date.now();
    const blinded = history.map((h) => { const { test_passed, test_failed, test_total, test_results, ...rest } = h; return rest; });
    currentDesc = improveDescription({
      skillName: name, skillContent: content, currentDescription: currentDesc,
      evalResults: trainRes as any, history: blinded, model: opts.model, logDir: opts.logDir, iteration: iter,
    });
    if (opts.verbose) console.error(`Proposed (${((Date.now() - t1) / 1000).toFixed(1)}s): ${currentDesc}`);
  }

  const best = testSet.length
    ? history.reduce((b, h) => ((h.test_passed ?? 0) > (b.test_passed ?? 0) ? h : b))
    : history.reduce((b, h) => (h.train_passed > b.train_passed ? h : b));
  const bestScore = testSet.length ? `${best.test_passed}/${best.test_total}` : `${best.train_passed}/${best.train_total}`;

  if (opts.verbose) console.error(`\nExit: ${exitReason}\nBest: ${bestScore} (iteration ${best.iteration})`);

  return {
    exit_reason: exitReason, original_description: origDesc,
    best_description: best.description, best_score: bestScore,
    best_train_score: `${best.train_passed}/${best.train_total}`,
    best_test_score: testSet.length ? `${best.test_passed}/${best.test_total}` : null,
    final_description: currentDesc, iterations_run: history.length,
    holdout: opts.holdout, train_size: trainSet.length, test_size: testSet.length, history,
  };
}

// ── CLI ──────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    options: {
      "eval-set": { type: "string" }, "skill-path": { type: "string" }, description: { type: "string" },
      "num-workers": { type: "string", default: "10" }, timeout: { type: "string", default: "30" },
      "max-iterations": { type: "string", default: "5" }, "runs-per-query": { type: "string", default: "3" },
      "trigger-threshold": { type: "string", default: "0.5" }, holdout: { type: "string", default: "0.4" },
      model: { type: "string" }, verbose: { type: "boolean", default: false },
      report: { type: "string", default: "auto" }, "results-dir": { type: "string" },
    },
    strict: true,
  });

  if (!values["eval-set"] || !values["skill-path"] || !values.model) {
    console.error("Usage: npx tsx scripts/run_loop.ts --eval-set <path> --skill-path <path> --model <model>");
    process.exit(1);
  }

  const evalSet: EvalItem[] = JSON.parse(readFileSync(values["eval-set"]!, "utf-8"));
  const skillPath = values["skill-path"]!;
  if (!existsSync(join(skillPath, "SKILL.md"))) { console.error(`Error: No SKILL.md at ${skillPath}`); process.exit(1); }

  const { name } = parseSkillMd(skillPath);
  let liveReportPath: string | undefined;
  if (values.report !== "none") {
    liveReportPath = values.report === "auto"
      ? join(tmpdir(), `skill_desc_report_${name}_${Date.now()}.html`)
      : values.report;
    writeFileSync(liveReportPath, '<html><body><h1>Starting...</h1><meta http-equiv="refresh" content="5"></body></html>');
    try { const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"; execSync(`${cmd} "${liveReportPath}"`, { stdio: "ignore" }); } catch {}
  }

  let resultsDir: string | undefined, logDir: string | undefined;
  if (values["results-dir"]) {
    resultsDir = join(values["results-dir"], new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
    mkdirSync(resultsDir, { recursive: true });
    logDir = join(resultsDir, "logs");
  }

  const output = await runLoop({
    evalSet, skillPath, descriptionOverride: values.description,
    numWorkers: parseInt(values["num-workers"]!, 10), timeout: parseInt(values.timeout!, 10),
    maxIterations: parseInt(values["max-iterations"]!, 10), runsPerQuery: parseInt(values["runs-per-query"]!, 10),
    triggerThreshold: parseFloat(values["trigger-threshold"]!), holdout: parseFloat(values.holdout!),
    model: values.model!, verbose: values.verbose!, liveReportPath, logDir,
  });

  const json = JSON.stringify(output, null, 2);
  console.log(json);
  if (resultsDir) writeFileSync(join(resultsDir, "results.json"), json);
  if (liveReportPath) {
    writeFileSync(liveReportPath, generateHtml(output, { autoRefresh: false, skillName: name }));
    console.error(`\nReport: ${liveReportPath}`);
  }
  if (resultsDir && liveReportPath) writeFileSync(join(resultsDir, "report.html"), generateHtml(output, { autoRefresh: false, skillName: name }));
  if (resultsDir) console.error(`Results saved to: ${resultsDir}`);
}

if (process.argv[1]?.endsWith("run_loop.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
