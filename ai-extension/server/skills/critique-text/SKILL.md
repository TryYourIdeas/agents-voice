---
name: critique-text
description: Critically review text from a web page — arguments, evidence, clarity, and bias. Use when the user asks to review, critique, fact-check, or find flaws in selected or full-page text.
---

# Critique Text Skill

Use this when the user attaches page/selection context and asks for a critical review,
fact-check, or general opinion of the text.

## Approach

1. Identify the text's main claim(s) or purpose.
2. Evaluate:
   - **Argument structure** — is the reasoning sound? Any logical fallacies or unsupported leaps?
   - **Evidence** — are claims backed by data, citations, or examples? Is the evidence current and relevant?
   - **Clarity** — is the writing clear, or vague/ambiguous in ways that matter?
   - **Bias/framing** — does the text present one side, omit context, or use loaded language?
3. For specific, checkable factual claims that matter to the critique (dates, statistics,
   named sources, "X happened/said Y") — use the `web_search` tool to verify them against
   current results before rendering a verdict. Skip this for claims that are opinion,
   too vague to check, or not material to the argument; not every sentence needs a search.
4. Structure the response as: a one-sentence summary of what the text argues, followed by
   specific strengths, specific weaknesses (quote or point to the exact part of the text,
   and cite what a search turned up if you checked a claim), and (if asked) a verdict or
   recommendation.
5. Be specific — vague feedback like "could be clearer" is not useful; point to the exact
   sentence or claim and say what's wrong with it.
6. If no context was attached and the user's message doesn't include the text to review,
   ask them to select the text or use the "Use page" button before proceeding.
