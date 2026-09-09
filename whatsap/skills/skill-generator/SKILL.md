---
name: skill-creator
description: >
  Create new skills, modify and improve existing skills, and measure skill
  performance. Use this skill whenever the user wants to create a skill from
  scratch, edit or update an existing skill, run evals or test cases against a
  skill, benchmark skill performance with variance analysis, or optimize a
  skill's description for better triggering accuracy. Also use when the user
  says things like "turn this into a skill", "package this workflow",
  "make this reusable", "improve my skill", or discusses skill triggering,
  eval design, or skill descriptions — even if they don't use the word "skill"
  explicitly. If the conversation has involved a multi-step workflow and the
  user wants to capture or automate it, this is the right skill.
---

# Skill Creator

A skill for creating, testing, and iterating on other skills.

## Overview

The core loop for building a skill:

1. **Draft** — Understand what the user wants and write a SKILL.md
2. **Test** — Create realistic test prompts, run them with the skill active
3. **Review** — Show outputs to the user; draft quantitative assertions while runs execute
4. **Iterate** — Revise the skill based on feedback, rerun, repeat
5. **Optimize description** — Tune the `description` field so the skill triggers reliably
6. **Package** — Bundle the final skill for installation

Your job is to figure out where the user is in this process and help them move forward. Maybe they want to create from scratch. Maybe they have an existing skill that needs improvement. Maybe they just want to optimize triggering. Meet them where they are.

Be flexible — if the user says "I don't need formal evals, just vibe with me," do that instead.

---

## 1. Capturing Intent

Start by understanding what the user needs. If the conversation already contains a workflow the user wants to capture ("turn this into a skill"), extract what you can from context first — tools used, step sequence, corrections made, input/output formats. Then fill gaps with the user.

Four questions to answer before writing anything:

1. **What should this skill enable Claude to do?** Get concrete: "generate a weekly status report from Jira tickets" is better than "help with reports."
2. **When should it trigger?** What phrases, file types, or contexts should activate it? What adjacent tasks should *not* trigger it?
3. **What's the expected output?** File format, structure, tone, length.
4. **Should we set up test cases?** Skills with objectively verifiable outputs (file transforms, data extraction, structured workflows) benefit from test cases. Skills with subjective outputs (writing style, creative work) often don't. Suggest the appropriate default, but let the user decide.

Proactively ask about edge cases, dependencies, and example files. Check available MCPs for research (docs, similar skills, best practices). Come prepared so you reduce burden on the user.

Wait to write test prompts until you've ironed out the intent.

---

## 2. Writing the SKILL.md

### Anatomy of a Skill

```
skill-name/
├── SKILL.md              # Required — frontmatter + instructions
├── scripts/              # Optional — executable code
├── references/           # Optional — docs loaded on demand
└── assets/               # Optional — templates, images, data files
```

### Frontmatter

Every SKILL.md starts with YAML frontmatter:

```yaml
---
name: my-skill
description: >
  What the skill does and when to use it. This is the primary
  triggering mechanism — include both capabilities AND specific
  contexts. Make it pushy (see below).
---
```

Optional fields: `license`, `compatibility`, `metadata`, `allowed-tools`. Use `compatibility` only if the skill has genuine environment requirements (e.g., "Requires git and docker"). Most skills don't need it.

#### Writing the description

The `description` field carries the entire burden of triggering. Agents see only `name` + `description` at startup and decide whether to load the full skill based on that.

Principles:

- **Use imperative phrasing.** "Use this skill when..." not "This skill does..."
- **Focus on user intent.** Describe what the user is trying to achieve, not implementation details.
- **Be pushy.** Explicitly list contexts where the skill applies, including cases where the user doesn't name the domain directly. Example: "even if they don't explicitly mention 'CSV' or 'analysis.'"
- **Stay under 1024 characters.** That's the hard limit.

Example of a weak vs. strong description:

```yaml
# Weak
description: Process CSV files.

# Strong
description: >
  Analyze CSV and tabular data files — compute summary statistics,
  add derived columns, generate charts, and clean messy data. Use
  when the user has a CSV, TSV, or Excel file and wants to explore,
  transform, or visualize the data, even if they don't explicitly
  mention "CSV" or "analysis."
```

### Progressive Disclosure

Skills use a three-level loading system:

1. **Metadata** (~100 tokens) — `name` + `description`, always in context
2. **SKILL.md body** (<500 lines ideal) — loaded when the skill triggers
3. **Bundled resources** (unlimited) — loaded only when needed; scripts can execute without being read into context

Keep the SKILL.md body focused on what the agent needs to know immediately. Move detailed reference material, large examples, and domain-specific docs into `references/`. Reference them clearly with guidance on *when* to read them:

```markdown
For AWS-specific deployment steps, read `references/aws.md`.
For GCP, read `references/gcp.md`.
```

For large reference files (>300 lines), include a table of contents at the top.

### The Principle of Least Surprise

A skill's contents should not surprise the user in their intent. Don't create misleading skills or skills designed to facilitate unauthorized access, data exfiltration, or other malicious activities.

### Writing Patterns

Use the imperative form. Explain the *why* behind instructions — today's models have good theory of mind and respond better to reasoning than rigid MUSTs. If you find yourself writing ALWAYS or NEVER in all caps, that's a yellow flag: try reframing with the reasoning instead.

**Define output formats** with templates:

```markdown
## Report structure
Use this template:
# [Title]
## Executive summary
## Key findings
## Recommendations
```

**Include examples** — they're one of the most effective ways to convey intent:

```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

### Scripts

When the skill involves deterministic or repetitive work, bundle scripts in `scripts/`. Good candidates: file processing, validation, data transformation, report generation.

Design scripts for agentic use:

- **No interactive prompts.** Agents run in non-interactive shells. Accept all input via flags, env vars, or stdin.
- **Include `--help`.** This is how the agent learns the interface.
- **Write clear error messages.** Say what went wrong, what was expected, and what to try.
- **Use structured output.** JSON or CSV to stdout; diagnostics to stderr.
- **Keep output predictable in size.** Large output gets truncated; default to summaries with pagination flags.
- **Make operations idempotent.** Agents may retry. "Create if not exists" is safer than "create and fail on duplicate."

For Python scripts, use PEP 723 inline dependencies so they're self-contained:

```typescript
# /// script
# dependencies = ["beautifulsoup4>=4.12,<5"]
# ///
```

Run with `uv run scripts/extract.py` — no separate install step needed.

---

## 3. Testing

After writing the skill draft, create 2–3 realistic test prompts — the kind of thing a real user would actually say, with file paths, personal context, casual language. Share them with the user for review before running.

Save test cases to `evals/evals.json`:

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

Don't write assertions yet — just prompts. You'll draft assertions in the next step while runs are in progress.

### What makes a good test case

- **Realistic.** Include file paths (`~/Downloads/report_final_v2.xlsx`), personal context ("my manager asked me to..."), specific details (column names, data values).
- **Varied.** Mix casual and formal phrasing, terse and detailed prompts, simple and multi-step tasks.
- **Substantive.** Claude only consults skills for tasks it can't easily handle alone. "Read this PDF" won't trigger a skill regardless of description quality. Test with tasks that genuinely need the skill's specialized knowledge.

### Running test cases

For each test case, run the skill and capture the output. If subagents are available, spawn with-skill and baseline runs in parallel (see Platform Adaptations below). Organize results by iteration:

```
workspace/
├── iteration-1/
│   ├── eval-0-descriptive-name/
│   │   ├── with_skill/outputs/
│   │   └── without_skill/outputs/
│   └── eval-1-descriptive-name/
└── iteration-2/
```

While runs execute, draft quantitative assertions — objectively verifiable statements like "output contains a profit margin column" or "file is valid PDF." Subjective qualities (writing tone, design aesthetics) are better evaluated by the user directly.

See `references/schemas.md` for full JSON schemas for evals, grading, and benchmarks.

---

## 4. Evaluating & Iterating

### Reviewing with the user

Use `scripts/generate_review.ts` to build an interactive HTML reviewer that shows the user each test case's output alongside the prompt, previous iteration outputs, and formal grades. Generate the viewer *before* evaluating outputs yourself — get them in front of the human as soon as possible.

```bash
npx tsx scripts/generate_review.ts \
  --workspace <workspace>/iteration-N \
  --skill-name <name>
```

The viewer lets the user browse outputs, see assertion pass/fail, and write feedback per test case. When they click "Submit All Reviews," feedback saves to `feedback.json`.

Run `scripts/aggregate-benchmark.ts` to produce `benchmark.json` and `benchmark.md` with pass rates, timing, and token usage across configurations.

### How to improve the skill

After reading user feedback:

1. **Generalize from the feedback.** Don't overfit to specific test cases. The skill will be used across many different prompts — if it only works for your test examples, it's useless. When a stubborn issue persists, try a structurally different approach rather than incremental tweaks.

2. **Keep the prompt lean.** Read transcripts, not just final outputs. If the skill makes the model waste time on unproductive steps, remove those instructions.

3. **Explain the why.** Convey reasoning rather than rigid rules. Models respond better to understanding *why* something matters than to "ALWAYS do X."

4. **Look for repeated work.** If every test run independently writes the same helper script, bundle it in `scripts/`.

### The iteration loop

1. Apply improvements to the skill
2. Rerun all test cases into `iteration-<N+1>/`
3. Launch the viewer with `--previous-workspace` pointing at the prior iteration
4. Wait for user review
5. Read feedback, improve, repeat

Stop when: the user is happy, feedback is all empty, or improvements plateau.

### Blind comparison (advanced, optional)

For rigorous A/B testing between skill versions, read `agents/comparator.md` and `agents/analyzer.md`. An independent agent judges two outputs without knowing which is which. Most users won't need this — the human review loop is usually sufficient.

---

## 5. Optimizing the Description

After the skill's outputs are solid, optimize the `description` field so it triggers reliably. This is a separate concern from output quality — a great skill is useless if it never activates.

### Step 1: Generate trigger eval queries

Create ~20 queries — 8–10 should-trigger and 8–10 should-not-trigger. Save as JSON:

```json
[
  {"query": "realistic user prompt here", "should_trigger": true},
  {"query": "near-miss prompt that should NOT trigger", "should_trigger": false}
]
```

**Should-trigger queries:** Vary phrasing (formal, casual, typos), explicitness (names the domain vs. implies it), detail level, and complexity. The most useful ones are where the connection to the skill isn't obvious from the query alone.

**Should-not-trigger queries:** Focus on near-misses — queries sharing keywords or concepts with your skill but needing something different. "Write a fibonacci function" as a negative test for a PDF skill tests nothing. "Write a Python script that reads a CSV and uploads rows to Postgres" is a much better near-miss for a CSV *analysis* skill.

Make queries realistic: include file paths, personal context, abbreviations, and casual speech.

### Step 2: Review with user

Present the eval set to the user for review. Bad eval queries lead to bad descriptions. Let them edit, add, or remove entries before proceeding.

If the HTML template is available (`assets/eval_review.html`), use it for interactive review. Otherwise, present the queries inline in the conversation.

### Step 3: Run the optimization loop

```bash
npx tsx scripts/run-loop.ts \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

This automates the full cycle: splits the eval set 60/40 train/validation, evaluates trigger rates (3 runs per query), proposes description improvements via Claude, re-evaluates, and iterates up to 5 times. It selects the best description by validation score to avoid overfitting.

Tell the user this will take some time. Periodically tail the output to share progress.

### Step 4: Apply the result

Take `best_description` from the output and update the skill's frontmatter. Show the user before/after with scores. Verify the description is under 1024 characters.

---

## 6. Packaging

When the skill is ready, package it for installation:

```bash
npx tsx scripts/package-skill.ts <path/to/skill-folder>
```

This produces a `.skill` file. If `present_files` is available, use it to share the file with the user. If not, tell the user where to find it on the filesystem.

**Updating an existing skill:** Preserve the original `name` field and directory name. Copy to a writable location before editing (`/tmp/skill-name/`). Output the same filename (e.g., `research-helper.skill`, not `research-helper-v2.skill`).

---

## Communicating with the User

Skill creation attracts users across a wide range of technical familiarity. Pay attention to context cues:

- Terms like "evaluation" and "benchmark" are fine to use freely.
- For "JSON", "assertion", "frontmatter" — check for cues that the user understands these before using them without a brief explanation.
- When in doubt, briefly define terms. A one-line explanation never hurts.

---

## Reference Files

Read these when you need them:

- `agents/grader.md` — How to evaluate assertions against outputs
- `agents/comparator.md` — How to do blind A/B comparison
- `agents/analyzer.md` — How to analyze why one version beat another
- `references/schemas.md` — JSON schemas for evals.json, grading.json, benchmark.json, etc.

---

**The core loop, one more time:**

1. Figure out what the skill is about
2. Draft or edit the skill
3. Run test prompts with the skill active
4. Review outputs with the user (generate the eval viewer first!)
5. Run quantitative evals if applicable
6. Iterate until satisfied
7. Optimize the description
8. Package and deliver