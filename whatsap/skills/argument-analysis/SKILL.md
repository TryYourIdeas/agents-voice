---
name: argument-analysis
description: The workflow for critically analyzing a piece of text/argument — extract claims, fact-check them, assess logical structure, cross-reference fallacies/strategies, and assemble a structured report. Use for any request to critically evaluate, fact-check, or find flaws in an argument, article, or claim.
allowed-tools:
  - web_search: for fact-checking individual claims
  - fetch_url: for reading a source URL more deeply when a claim needs it
---

# Argument Analysis

This is the core workflow for analyzing a piece of content critically. Work
through these steps in order and produce the structured report described at
the end — every section appears every time, even when a section's answer is
"none."

## 1. Extract Claims

Break the source text into discrete, numbered claims. For each one, tag it:

- **Factual** — checkable against reality (a number, an event, a causal
  claim, an attributed quote).
- **Opinion/Value** — not fact-checkable (a judgment, a preference, a
  should-statement).

Don't merge multiple claims into one just because they're in the same
sentence — split them if they'd need separate verification.

## 2. Fact-Check Factual Claims

For each factual claim, use the `web_search` tool (and `fetch_url` if a
source needs deeper reading than the search snippet gives you). Assign
exactly one verdict:

- **Supported** — search results corroborate the claim. Cite the source
  links.
- **Contradicted** — search results conflict with the claim. Cite the
  source links.
- **Unverifiable** — search didn't turn up anything conclusive either way.

**Never fabricate a verdict.** "Unverifiable" is a legitimate, honest
outcome — reaching for "supported" or "contradicted" without real search
evidence behind it defeats the entire purpose of this agent.

## 3. Map Logical Structure

Identify the premises and the conclusion(s) they're meant to support.
State explicitly whether the argument is:

- **Valid** — the conclusion actually follows from the premises, as a
  matter of logical structure. (This is independent of whether the
  premises are *true* — a valid argument can still have a false premise.)
- **Invalid** — the conclusion doesn't actually follow, even granting the
  premises.

Then separately note whether the argument is **sound** (valid AND all
premises are true, per your fact-check above) — soundness requires both
validity and true premises; keep these two judgments distinct in the
report rather than collapsing them into one verdict.

## 4. Cross-Reference Fallacies and Strategies

For anything that reads as a reasoning defect, consult the
`logical-fallacies` skill (via `load_skill`) to name it precisely — quote
the exact snippet that triggered it, and don't name a fallacy that isn't in
that taxonomy. If nothing fits, the section says "None identified."

For rhetorical technique independent of validity (how the argument is
*framed* or *delivered*, not whether it's *valid*), consult the
`argumentation-strategies` skill the same way. If nothing notable, "None
notable."

## 5. Assemble the Report

Always use this exact structure:

```
## Claims Extracted
1. [claim text] — Factual | Opinion/Value
(numbered, one per claim)

## Fact-Check Results
1. [claim] — Supported / Contradicted / Unverifiable
   Sources: [links]
(one per factual claim; if there were no factual claims, say so instead
of omitting the section)

## Logical Structure
[Premises → conclusion in prose. Explicit Valid/Invalid judgment. Explicit
Sound/Unsound judgment, tied back to the fact-check results above.]

## Fallacies Identified
- [Fallacy name]: "[quoted snippet]" — why it qualifies
(or: "None identified.")

## Argumentation Strategies Observed
- [Strategy name]: "[quoted snippet]"
(or: "None notable.")

## Overall Verdict
Sound / Partially Sound / Unsound — one paragraph tying the sections
above together. Never a bare label with no justification.
```

"Partially Sound" covers the common real-world case: valid structure with
one or two unsupported/contradicted premises, or an otherwise strong
argument that leans on one identified fallacy without invalidating the
whole thing.
