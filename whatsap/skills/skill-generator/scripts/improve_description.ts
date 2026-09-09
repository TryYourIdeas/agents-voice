#!/usr/bin/env npx tsx
/**
 * Improve a skill description based on eval results.
 *
 * Calls `claude -p` as a subprocess to generate an improved description
 * (uses the session's Claude Code auth, no separate API key needed).
 *
 * Usage:
 *   npx tsx scripts/improve_description.ts --eval-results <path> --skill-path <path> --model <model>
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseSkillMd } from "./utils.ts";

// ── Types ─────────────────────────────────────────────────────────────────

interface EvalResultEntry {
  query: string;
  should_trigger: boolean;
  pass: boolean;
  triggers: number;
  runs: number;
}

interface EvalResults {
  description: string;
  results: EvalResultEntry[];
  summary: { passed: number; failed: number; total: number };
}

interface HistoryEntry {
  description: string;
  passed?: number;
  failed?: number;
  total?: number;
  train_passed?: number;
  train_total?: number;
  test_passed?: number | null;
  test_total?: number | null;
  results?: EvalResultEntry[];
  note?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function callClaude(prompt: string, model?: string, timeout = 300): string {
  const cmd = ["claude", "-p", "--output-format", "text"];
  if (model) cmd.push("--model", model);

  const env = { ...process.env };
  delete (env as any).CLAUDECODE;

  return execSync(cmd.join(" "), {
    input: prompt,
    encoding: "utf-8",
    timeout: timeout * 1000,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function extractDescription(text: string): string {
  const match = text.match(/<new_description>([\s\S]*?)<\/new_description>/);
  return match ? match[1].trim().replace(/^"|"$/g, "") : text.trim().replace(/^"|"$/g, "");
}

// ── Core ──────────────────────────────────────────────────────────────────

export function improveDescription(opts: {
  skillName: string;
  skillContent: string;
  currentDescription: string;
  evalResults: EvalResults;
  history: HistoryEntry[];
  model: string;
  testResults?: EvalResults | null;
  logDir?: string | null;
  iteration?: number | null;
}): string {
  const {
    skillName, skillContent, currentDescription, evalResults,
    history, model, testResults, logDir, iteration,
  } = opts;

  const failedTriggers = evalResults.results.filter((r) => r.should_trigger && !r.pass);
  const falseTriggers = evalResults.results.filter((r) => !r.should_trigger && !r.pass);

  const trainScore = `${evalResults.summary.passed}/${evalResults.summary.total}`;
  const testScore = testResults ? `${testResults.summary.passed}/${testResults.summary.total}` : null;
  const scoresSummary = testScore ? `Train: ${trainScore}, Test: ${testScore}` : `Train: ${trainScore}`;

  let prompt = `You are optimizing a skill description for a Claude Code skill called "${skillName}". A "skill" is sort of like a prompt, but with progressive disclosure -- there's a title and description that Claude sees when deciding whether to use the skill, and then if it does use the skill, it reads the .md file which has lots more details.

The description appears in Claude's "available_skills" list. When a user sends a query, Claude decides whether to invoke the skill based solely on the title and on this description. Your goal is to write a description that triggers for relevant queries, and doesn't trigger for irrelevant ones.

Here's the current description:
<current_description>
"${currentDescription}"
</current_description>

Current scores (${scoresSummary}):
<scores_summary>
`;

  if (failedTriggers.length > 0) {
    prompt += "FAILED TO TRIGGER (should have triggered but didn't):\n";
    for (const r of failedTriggers) prompt += `  - "${r.query}" (triggered ${r.triggers}/${r.runs} times)\n`;
    prompt += "\n";
  }

  if (falseTriggers.length > 0) {
    prompt += "FALSE TRIGGERS (triggered but shouldn't have):\n";
    for (const r of falseTriggers) prompt += `  - "${r.query}" (triggered ${r.triggers}/${r.runs} times)\n`;
    prompt += "\n";
  }

  if (history.length > 0) {
    prompt += "PREVIOUS ATTEMPTS (do NOT repeat these — try something structurally different):\n\n";
    for (const h of history) {
      const ts = `${h.train_passed ?? h.passed ?? 0}/${h.train_total ?? h.total ?? 0}`;
      const testS = h.test_passed != null ? `${h.test_passed}/${h.test_total}` : null;
      prompt += `<attempt train=${ts}${testS ? `, test=${testS}` : ""}>\n`;
      prompt += `Description: "${h.description}"\n`;
      if (h.results) {
        prompt += "Train results:\n";
        for (const r of h.results) prompt += `  [${r.pass ? "PASS" : "FAIL"}] "${r.query.slice(0, 80)}" (triggered ${r.triggers}/${r.runs})\n`;
      }
      if (h.note) prompt += `Note: ${h.note}\n`;
      prompt += "</attempt>\n\n";
    }
  }

  prompt += `</scores_summary>

Skill content (for context on what the skill does):
<skill_content>
${skillContent}
</skill_content>

Based on the failures, write a new and improved description. Generalize from failures to broader categories — don't overfit to specific queries. Keep it 100-200 words max. Hard limit: 1024 characters.

Tips:
- Imperative phrasing: "Use this skill for..." not "This skill does..."
- Focus on user intent, not implementation details
- Make it distinctive — it competes with other skill descriptions
- Be creative and try different structures across iterations

Please respond with only the new description text in <new_description> tags, nothing else.`;

  let description = extractDescription(callClaude(prompt, model));

  const transcript: Record<string, any> = {
    iteration, prompt,
    parsed_description: description,
    char_count: description.length,
    over_limit: description.length > 1024,
  };

  if (description.length > 1024) {
    const shortenPrompt = `${prompt}\n\n---\n\nA previous attempt produced this description (${description.length} chars, over 1024 limit):\n\n"${description}"\n\nRewrite under 1024 characters. Respond in <new_description> tags.`;
    description = extractDescription(callClaude(shortenPrompt, model));
    transcript.rewrite_description = description;
    transcript.rewrite_char_count = description.length;
  }

  transcript.final_description = description;

  if (logDir) {
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(logDir, `improve_iter_${iteration ?? "unknown"}.json`), JSON.stringify(transcript, null, 2));
  }

  return description;
}

// ── CLI ───────────────────────────────────────────────────────────────────

function main() {
  const { values } = parseArgs({
    options: {
      "eval-results": { type: "string" },
      "skill-path": { type: "string" },
      history: { type: "string" },
      model: { type: "string" },
      verbose: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (!values["eval-results"] || !values["skill-path"] || !values.model) {
    console.error("Usage: npx tsx scripts/improve_description.ts --eval-results <path> --skill-path <path> --model <model>");
    process.exit(1);
  }

  const skillPath = values["skill-path"]!;
  if (!existsSync(join(skillPath, "SKILL.md"))) {
    console.error(`Error: No SKILL.md found at ${skillPath}`);
    process.exit(1);
  }

  const evalResults: EvalResults = JSON.parse(readFileSync(values["eval-results"]!, "utf-8"));
  const historyData: HistoryEntry[] = values.history ? JSON.parse(readFileSync(values.history, "utf-8")) : [];
  const { name, content } = parseSkillMd(skillPath);

  if (values.verbose) {
    console.error(`Current: ${evalResults.description}`);
    console.error(`Score: ${evalResults.summary.passed}/${evalResults.summary.total}`);
  }

  const newDesc = improveDescription({
    skillName: name, skillContent: content,
    currentDescription: evalResults.description,
    evalResults, history: historyData, model: values.model!,
  });

  if (values.verbose) console.error(`Improved: ${newDesc}`);

  console.log(JSON.stringify({
    description: newDesc,
    history: [...historyData, {
      description: evalResults.description,
      passed: evalResults.summary.passed,
      failed: evalResults.summary.failed,
      total: evalResults.summary.total,
      results: evalResults.results,
    }],
  }, null, 2));
}

if (process.argv[1]?.endsWith("improve_description.ts")) {
  main();
}
