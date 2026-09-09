---
name: story-structure-frameworks
description: Named story-structure frameworks (three-act, ABT, Story Circle, Pixar spine, Sparkline, Vonnegut shapes) the coach can teach the user to retell a story against. Use when a story's Structure or Ending/Resolution score is weak, or a story reads as a flat list of events rather than a narrative.
allowed-tools:
  - none (this skill is pure coaching knowledge, no tools required)
---

# Story Structure Frameworks

The base coaching prompt evaluates *whether* structure is working (the "Structure" and
"Ending/Resolution" dimensions) but doesn't give the user a concrete template to fix it with.
This skill is that template library. Reach for it whenever a story's core problem is structural —
it's a chronological list ("this happened, then this happened, then this happened"), it has no
turn, or it doesn't know how to end — rather than a problem of detail, emotion, or pacing (those
are covered directly in the base prompt).

## Diagnostic: is this a structure problem?

Ask: **can the story be summarized as "X happened, then Y happened, then Z happened"** with no
word that implies causation or consequence? If yes, it's a structure problem — use this skill.
If the events already imply cause-and-effect but the story still isn't landing, the problem is
more likely detail, stakes, or pacing — coach those directly instead of forcing a framework onto
it.

## The single most useful test: ABT (And, But, Therefore)

Before reaching for a bigger framework, apply this one first — it fixes the most common failure
mode (the "and then... and then..." list) in one move, and it works for a story of any length,
including ones told in under a minute.

Randy Olson's ABT template says a story's spine should read as: **[situation], BUT [complication],
THEREFORE [resolution]** — not "and, and, and." Concretely:

- **AND** = normal, expected connective tissue (background, sequence). Fine in small doses.
- **BUT** = the turn. Something breaks the expected pattern — an obstacle, a surprise, a conflict,
  a decision point. A story needs at least one real BUT.
- **THEREFORE** = consequence. Because of the BUT, something happened, changed, or was decided.
  Without a THEREFORE, the BUT is just a complication that trails off.

**How to use it in a coaching session:** ask the user to compress their own story into one
sentence using exactly this shape: "I was ___, BUT ___, THEREFORE ___." If they can't fill in the
BUT, there's no real conflict yet — that's the highest-impact thing to fix, ahead of any detail or
delivery notes. If they can't fill in the THEREFORE, the story doesn't have a resolution — it just
stops. This single sentence is also a fast way to write the "Try This" retelling challenge:
"Retell it, but make sure I can hear the word 'but' and the word 'therefore' in there somewhere."

## Three-Act Structure

The most universal shape, good default for interview-style and mid-length stories (30s–2min told).

1. **Act 1 — Setup (~20-25% of the story):** who, where, what they wanted, what was normal. End
   the act with an inciting incident — the moment normal breaks.
2. **Act 2 — Confrontation (~50-60%):** rising complications. The obstacle gets harder, or the
   stakes get clearer, culminating in a climax — the hardest moment, the decision point, the point
   of maximum tension.
3. **Act 3 — Resolution (~20-25%):** the immediate aftermath of the climax, then what changed.

**Coaching cue:** if a user's story spends most of its time in Act 1 (context/background) and
rushes Act 3, that's the single most common pacing bug this framework surfaces — call it out by
name: "You gave us two minutes of setup and five seconds of resolution — flip that ratio."

## Dan Harmon's Story Circle (8 steps)

A tighter, cause-and-effect-forward version of the Hero's Journey — very well suited to short
personal anecdotes (the exact format this coach practices), because every step is a single
sentence, not a full act.

1. **You** — a character in a zone of comfort
2. **Need** — but they want something
3. **Go** — they enter an unfamiliar situation
4. **Search** — adapt to it, find what they're looking for
5. **Find** — get what they wanted
6. **Take** — pay a heavy price for it
7. **Return** — go back to their familiar situation
8. **Change** — having changed

**Coaching cue:** use this as a checklist, not a script to read aloud. If a user's story is missing
step 6 (Take — the price/cost), that's usually why an otherwise-good story feels hollow: they got
what they wanted with no cost, so there's nothing at stake in retrospect. That's a more precise,
actionable version of "add more tension."

## Pixar Spine

A one-breath compression drill, useful when a story is too sprawling and needs to be cut down for
a "tell it in 30 seconds" Level-5 challenge.

> Once upon a time there was ___. Every day, ___. Until one day, ___. Because of that, ___.
> Because of that, ___. Until finally, ___.

**Coaching cue:** the two "because of that" beats are the load-bearing ones — they force a causal
chain instead of a list. If a user's compressed version skips straight from "until one day" to
"until finally," ask them to find the one intermediate consequence they're leaving out.

## Nancy Duarte's Sparkline

Built for persuasive/speech-style stories (contrasting "what is" with "what could be"), most
relevant for `interview preparation` topics where the story needs to land a point, not just
entertain.

Alternate between **what is** (the current/past reality, the problem) and **what could be** (the
possibility, the change) several times, ending decisively on **what could be** (the new reality
established by the story's outcome) — not back on "what is." A story that ends on the problem
rather than the change reads as unresolved even if the events are technically complete.

**Coaching cue:** if a story is being told for a job-application context, check whether the last
line lands on the "after" state (what the user does differently now, what the team/product looks
like now) rather than re-describing the original problem. Endings that drift back to the problem
are a Sparkline violation, even if the story dimension-scores otherwise fine.

## Kurt Vonnegut's Shapes of Stories

Useful less as a template to fill in and more as a *diagnostic vocabulary* for talking about a
story's emotional trajectory with the user — helps answer "what shape is this story, and is that
the shape you want?"

- **Man in a Hole** — things get worse, then better than where they started. (Most personal-growth
  and problem-solving stories are this shape.)
- **Boy Meets Girl** — things get better, then worse, then better again, ending higher than the
  start.
- **Cinderella** — steady rise, sudden fall, steady rise to a high ending.
- **Icarus** — steady rise, then a fall, ending low. (Rare in this coach's context — usually only
  appropriate for cautionary/lesson-learned stories, and even then usually paired with a coda that
  states the lesson to avoid ending on pure defeat.)

**Coaching cue:** ask the user to literally trace their story's emotional line with their finger in
the air, low-to-high over time. If it doesn't match any recognizable shape — it's flat, or it
wanders without a clear low or high point — that's a concrete way to show *why* the "Emotional
Engagement" dimension is scoring low, more specific than telling them to "add more feeling."

## Choosing which framework to reach for

| Situation | Reach for |
|---|---|
| Story is a flat list of events, no felt conflict | ABT — find the BUT and THEREFORE first, always |
| Story rambles or has bad pacing across acts | Three-Act Structure — check the setup/confrontation/resolution ratio |
| Story feels hollow even though nothing's "wrong" with it | Story Circle — check specifically for the missing "Take" (cost/price) step |
| Story needs to be compressed for a short retelling drill | Pixar Spine |
| Story is for a job application / needs to make a point | Sparkline — check where it ends: problem or change |
| User can't articulate what's off about the emotional arc | Vonnegut shapes — trace the arc together, name the shape |

Never introduce more than one framework in a single round of feedback (Coaching Rule 1: don't
overwhelm). Pick the one framework that best diagnoses the specific weakness you already found —
this skill is a diagnostic toolkit, not a checklist to run every story through.
