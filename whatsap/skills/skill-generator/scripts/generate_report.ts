#!/usr/bin/env npx tsx
/**
 * Generate an HTML report from run-loop output.
 *
 * Takes the JSON output from run-loop.ts and generates a visual HTML report
 * showing each description attempt with check/x for each test case.
 * Distinguishes between train and test queries.
 *
 * Usage:
 *   npx tsx scripts/generate-report.ts results.json [-o report.html] [--skill-name my-skill]
 *   cat results.json | npx tsx scripts/generate-report.ts - [-o report.html]
 */

import { readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";

// ── HTML Escaping ──────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Report Generator ───────────────────────────────────────────────────────

export function generateHtml(
  data: any,
  autoRefresh = false,
  skillName = ""
): string {
  const history: any[] = data.history ?? [];
  const titlePrefix = skillName ? `${escapeHtml(skillName)} — ` : "";

  // Extract train and test queries from first iteration
  interface QueryInfo {
    query: string;
    should_trigger: boolean;
  }
  const trainQueries: QueryInfo[] = [];
  const testQueries: QueryInfo[] = [];

  if (history.length > 0) {
    const firstIter = history[0];
    for (const r of firstIter.train_results ?? firstIter.results ?? []) {
      trainQueries.push({
        query: r.query,
        should_trigger: r.should_trigger ?? true,
      });
    }
    if (firstIter.test_results) {
      for (const r of firstIter.test_results) {
        testQueries.push({
          query: r.query,
          should_trigger: r.should_trigger ?? true,
        });
      }
    }
  }

  const refreshTag = autoRefresh
    ? '    <meta http-equiv="refresh" content="5">\n'
    : "";

  const parts: string[] = [];

  // Head + styles
  parts.push(`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
${refreshTag}    <title>${titlePrefix}Skill Description Optimization</title>
    <style>
        body { font-family: Georgia, serif; max-width: 100%; margin: 0 auto; padding: 20px; background: #faf9f5; color: #141413; }
        h1 { font-family: system-ui, sans-serif; color: #141413; }
        .explainer { background: white; padding: 15px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #e8e6dc; color: #b0aea5; font-size: 0.875rem; line-height: 1.6; }
        .summary { background: white; padding: 15px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #e8e6dc; }
        .summary p { margin: 5px 0; }
        .best { color: #788c5d; font-weight: bold; }
        .table-container { overflow-x: auto; width: 100%; }
        table { border-collapse: collapse; background: white; border: 1px solid #e8e6dc; border-radius: 6px; font-size: 12px; min-width: 100%; }
        th, td { padding: 8px; text-align: left; border: 1px solid #e8e6dc; white-space: normal; word-wrap: break-word; }
        th { font-family: system-ui, sans-serif; background: #141413; color: #faf9f5; font-weight: 500; }
        th.test-col { background: #6a9bcc; }
        th.query-col { min-width: 200px; }
        td.description { font-family: monospace; font-size: 11px; word-wrap: break-word; max-width: 400px; }
        td.result { text-align: center; font-size: 16px; min-width: 40px; }
        td.test-result { background: #f0f6fc; }
        .pass { color: #788c5d; }
        .fail { color: #c44; }
        .rate { font-size: 9px; color: #b0aea5; display: block; }
        tr:hover { background: #faf9f5; }
        .score { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; }
        .score-good { background: #eef2e8; color: #788c5d; }
        .score-ok { background: #fef3c7; color: #d97706; }
        .score-bad { background: #fceaea; color: #c44; }
        .best-row { background: #f5f8f2; }
        th.positive-col { border-bottom: 3px solid #788c5d; }
        th.negative-col { border-bottom: 3px solid #c44; }
        .legend { display: flex; gap: 20px; margin-bottom: 10px; font-size: 13px; align-items: center; }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-swatch { width: 16px; height: 16px; border-radius: 3px; display: inline-block; }
        .swatch-positive { background: #141413; border-bottom: 3px solid #788c5d; }
        .swatch-negative { background: #141413; border-bottom: 3px solid #c44; }
        .swatch-test { background: #6a9bcc; }
        .swatch-train { background: #141413; }
    </style>
</head>
<body>
    <h1>${titlePrefix}Skill Description Optimization</h1>
    <div class="explainer">
        <strong>Optimizing your skill's description.</strong> This page updates automatically as Claude tests different versions. Each row is an iteration. Green checkmarks = correct trigger behavior; red crosses = incorrect. "Train" queries guide improvements; "Test" queries verify generalization.
    </div>
`);

  // Summary
  const bestTestScore = data.best_test_score;
  parts.push(`
    <div class="summary">
        <p><strong>Original:</strong> ${escapeHtml(data.original_description ?? "N/A")}</p>
        <p class="best"><strong>Best:</strong> ${escapeHtml(data.best_description ?? "N/A")}</p>
        <p><strong>Best Score:</strong> ${data.best_score ?? "N/A"} ${bestTestScore ? "(test)" : "(train)"}</p>
        <p><strong>Iterations:</strong> ${data.iterations_run ?? 0} | <strong>Train:</strong> ${data.train_size ?? "?"} | <strong>Test:</strong> ${data.test_size ?? "?"}</p>
    </div>
`);

  // Legend
  parts.push(`
    <div class="legend">
        <span style="font-weight:600">Query columns:</span>
        <span class="legend-item"><span class="legend-swatch swatch-positive"></span> Should trigger</span>
        <span class="legend-item"><span class="legend-swatch swatch-negative"></span> Should NOT trigger</span>
        <span class="legend-item"><span class="legend-swatch swatch-train"></span> Train</span>
        <span class="legend-item"><span class="legend-swatch swatch-test"></span> Test</span>
    </div>
`);

  // Table header
  parts.push(`
    <div class="table-container">
    <table>
        <thead>
            <tr>
                <th>Iter</th>
                <th>Train</th>
                <th>Test</th>
                <th class="query-col">Description</th>
`);

  for (const q of trainQueries) {
    const polarity = q.should_trigger ? "positive-col" : "negative-col";
    parts.push(
      `                <th class="${polarity}">${escapeHtml(q.query)}</th>\n`
    );
  }
  for (const q of testQueries) {
    const polarity = q.should_trigger ? "positive-col" : "negative-col";
    parts.push(
      `                <th class="test-col ${polarity}">${escapeHtml(q.query)}</th>\n`
    );
  }

  parts.push(`            </tr>
        </thead>
        <tbody>
`);

  // Find best iteration
  const bestIter = testQueries.length > 0
    ? history.reduce((a: any, b: any) =>
        (b.test_passed ?? 0) > (a.test_passed ?? 0) ? b : a
      ).iteration
    : history.reduce((a: any, b: any) =>
        (b.train_passed ?? b.passed ?? 0) > (a.train_passed ?? a.passed ?? 0)
          ? b
          : a
      ).iteration;

  // Rows
  for (const h of history) {
    const iteration = h.iteration ?? "?";
    const trainResults = h.train_results ?? h.results ?? [];
    const testResults = h.test_results ?? [];

    const trainByQuery = new Map(
      trainResults.map((r: any) => [r.query, r])
    );
    const testByQuery = new Map(
      testResults.map((r: any) => [r.query, r])
    );

    // Aggregate correct runs
    function aggregateRuns(
      results: any[]
    ): [number, number] {
      let correct = 0;
      let total = 0;
      for (const r of results) {
        total += r.runs ?? 0;
        if (r.should_trigger) {
          correct += r.triggers ?? 0;
        } else {
          correct += (r.runs ?? 0) - (r.triggers ?? 0);
        }
      }
      return [correct, total];
    }

    const [trainCorrect, trainRuns] = aggregateRuns(trainResults);
    const [testCorrect, testRuns] = aggregateRuns(testResults);

    function scoreClass(correct: number, total: number): string {
      if (total > 0) {
        const ratio = correct / total;
        if (ratio >= 0.8) return "score-good";
        if (ratio >= 0.5) return "score-ok";
      }
      return "score-bad";
    }

    const rowClass = iteration === bestIter ? "best-row" : "";

    parts.push(`            <tr class="${rowClass}">
                <td>${iteration}</td>
                <td><span class="score ${scoreClass(trainCorrect, trainRuns)}">${trainCorrect}/${trainRuns}</span></td>
                <td><span class="score ${scoreClass(testCorrect, testRuns)}">${testCorrect}/${testRuns}</span></td>
                <td class="description">${escapeHtml(h.description ?? "")}</td>
`);

    for (const q of trainQueries) {
      const r: any = trainByQuery.get(q.query) ?? {};
      const didPass = r.pass ?? false;
      const icon = didPass ? "✓" : "✗";
      const cls = didPass ? "pass" : "fail";
      parts.push(
        `                <td class="result ${cls}">${icon}<span class="rate">${r.triggers ?? 0}/${r.runs ?? 0}</span></td>\n`
      );
    }

    for (const q of testQueries) {
      const r: any = testByQuery.get(q.query) ?? {};
      const didPass = r.pass ?? false;
      const icon = didPass ? "✓" : "✗";
      const cls = didPass ? "pass" : "fail";
      parts.push(
        `                <td class="result test-result ${cls}">${icon}<span class="rate">${r.triggers ?? 0}/${r.runs ?? 0}</span></td>\n`
      );
    }

    parts.push("            </tr>\n");
  }

  parts.push(`        </tbody>
    </table>
    </div>
</body>
</html>
`);

  return parts.join("");
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (process.argv[1]?.includes("generate-report")) {
  const { values, positionals } = parseArgs({
    options: {
      output: { type: "string", short: "o" },
      "skill-name": { type: "string", default: "" },
    },
    allowPositionals: true,
    strict: true,
  });

  const inputPath = positionals[0];
  if (!inputPath) {
    console.error(
      "Usage: npx tsx scripts/generate-report.ts <results.json | -> [-o report.html]"
    );
    process.exit(1);
  }

  let data: any;
  if (inputPath === "-") {
    data = JSON.parse(readFileSync("/dev/stdin", "utf-8"));
  } else {
    data = JSON.parse(readFileSync(inputPath, "utf-8"));
  }

  const html = generateHtml(data, false, values["skill-name"]);

  if (values.output) {
    writeFileSync(values.output, html);
    console.error(`Report written to ${values.output}`);
  } else {
    console.log(html);
  }
}
