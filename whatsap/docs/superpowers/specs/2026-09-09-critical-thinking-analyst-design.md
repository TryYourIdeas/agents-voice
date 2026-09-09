# Critical Thinking Analyst Agent — Design

## Goal

A named agent that, given a piece of text, a URL, or a file, analyzes it from
a critical-thinking/logical-reasoning perspective: extracts the claims it
makes, fact-checks the checkable ones against the web, evaluates whether its
conclusions actually follow from its premises, and names any logical
fallacies or rhetorical/argumentation strategies it uses. Reachable like
every other named agent — `@ai @critical-thinking-analyst <text>`, or natural
delegation from the default agent via `delegate_to_agent`.

## Non-goals

- Not a general research assistant (that's `topic-research`/the default
  agent with `web_search`) — this agent's job is to evaluate the *reasoning*
  in a given piece of content, not to generate new research from scratch.
- Not a debate opponent or persuasion coach — it analyzes, it doesn't argue
  a side or try to win anyone over.
- Doesn't fact-check pure opinion/value claims ("this policy is bad") — only
  claims that are actually falsifiable get a fact-check verdict; opinions are
  tagged as such and evaluated for logical consistency, not truth.

## Agent definition

**File:** `agents/critical-thinking-analyst/agent.md`, following the
existing named-agent convention (frontmatter: `name`, `description`,
`allowed-tools`, `allowed-skills`; body = system prompt).

**`allowed-tools`:** `web_search`, `fetch_url`, `my_read_file`,
`list_directory` — covers all three input modes (pasted text needs none of
these; a URL needs `fetch_url`; a file needs `my_read_file`/
`list_directory`; fact-checking claims uses `web_search`).

**`allowed-skills`:** `logical-fallacies`, `argumentation-strategies`,
`argument-analysis` (all three, new — see below).

**`description`** (drives natural delegation from the default agent, same
mechanism as `task-scheduler`/`story-coach`): "Analyzes a piece of text,
article, or argument from a critical-thinking and logical-reasoning
perspective — extracts its claims, fact-checks the verifiable ones against
the web, evaluates whether the conclusion actually follows from the
premises, and identifies logical fallacies and rhetorical strategies used.
Use when the user shares an argument, article, claim, or URL and wants it
critically evaluated, fact-checked, or checked for fallacies/flawed
reasoning."

## Skills (new, under `whatsap/skills/`)

Each follows the existing `SKILL.md` frontmatter convention (`name`,
`description`, `allowed-tools`), same as `topic-research`.

### `skills/logical-fallacies/SKILL.md`

Reference taxonomy, loaded on demand when the agent needs to name/explain a
fallacy it has spotted. For each of ~20 fallacies: name, one-sentence
definition, a concrete example, and — critically — how to distinguish it
from a superficially similar but *valid* argument (e.g. citing an expert is
only the appeal-to-authority fallacy when the "expert" lacks relevant
expertise or expertise itself is being used to substitute for evidence; it's
not a fallacy just because an authority was cited).

Fallacies covered (informal + a few formal): straw man, false
dichotomy/false dilemma, ad hominem, appeal to authority, slippery slope,
circular reasoning (begging the question), hasty generalization, false
cause (post hoc/correlation-causation), red herring, motte-and-bailey, no
true Scotsman, equivocation, appeal to emotion, genetic fallacy, tu quoque,
sunk cost fallacy, Texas sharpshooter, burden-of-proof shifting, appeal to
ignorance, loaded question.

### `skills/argumentation-strategies/SKILL.md`

Reference catalog of rhetorical/persuasion techniques that are **not**
inherently fallacious but shape how an argument lands — distinguishing "this
is a persuasion technique" from "this is a reasoning error" is the point of
keeping this separate from `logical-fallacies`.

Techniques covered: anchoring, framing, gish gallop, steelmanning vs.
strawmanning, Overton-window shifting, selective emphasis/cherry-picking
(distinct from the Texas-sharpshooter *fallacy* — cherry-picking is the
strategy, Texas sharpshooter is the fallacy of implying pattern from
cherry-picked data), false balance, concern trolling, legitimate Socratic
questioning.

### `skills/argument-analysis/SKILL.md`

The process skill — always relevant for this agent's core task, describes
the actual analysis workflow:

1. **Extract claims** — break the source text into discrete numbered
   claims; tag each as *factual* (checkable against reality) or
   *opinion/value* (not fact-checkable, but still subject to logical
   consistency checks).
2. **Fact-check factual claims** — use `web_search` (and `fetch_url` if a
   source URL needs deeper reading) per factual claim. Each gets one of
   three verdicts: **supported** (with source links), **contradicted**
   (with source links), or **unverifiable** (search didn't turn up anything
   conclusive — this is a legitimate verdict, not a failure to hide).
   Never fabricate a verdict when search results are inconclusive.
3. **Map logical structure** — identify premises and the conclusion(s) they
   lead to. Assess validity (does the conclusion actually follow from the
   premises?) *independently* of whether the premises are individually
   true — an argument can be valid but unsound (true structure, false
   premise) or have true premises but not actually support the stated
   conclusion.
4. **Cross-reference fallacies/strategies** — for anything that looks like
   a reasoning defect, consult `logical-fallacies` to name it precisely
   (never invent a fallacy name that isn't in the taxonomy just to fill the
   section — if nothing fits, say so). For rhetorical technique
   (independent of validity), consult `argumentation-strategies`.
5. **Assemble the structured report** (see Output below).

## Output format

A fixed-section structured report, every time:

```
## Claims Extracted
1. [claim text] — Factual | Opinion/Value

## Fact-Check Results
1. [claim] — Supported / Contradicted / Unverifiable
   Sources: [links]
   (repeat per factual claim; omit section content if none were factual)

## Logical Structure
Premises → conclusion mapped out in prose; explicit validity assessment.

## Fallacies Identified
- [Fallacy name]: "[quoted snippet]" — why it qualifies
(or: "None identified.")

## Argumentation Strategies Observed
- [Strategy name]: "[quoted snippet]"
(or: "None notable.")

## Overall Verdict
Sound / Partially Sound / Unsound — one-paragraph justification tying
back to the sections above. Never a bare score with no reasoning.
```

## Core behavioral rule

Mirrors `task-scheduler`'s "never guess": the agent must not fabricate a
fact-check verdict when `web_search` is inconclusive (report
"unverifiable" instead), and must not invent a fallacy/strategy name that
isn't in the reference skills just to fill out a section (say "none
identified"/"none notable" instead). Precision over completeness-theater.

## Testing

This agent's own logic is prompt/skill content, not testable pure logic —
verified by hand against the running container (same established practice
as `index.ts`'s message handlers, per `whatsap/CLAUDE.md`'s Development
Conventions): feed it a piece of text with a deliberate fallacy and a false
factual claim, confirm the report correctly identifies both.
