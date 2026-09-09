---
name: requirements-and-framework
description: How to coach the requirements-clarification phase — functional vs. non-functional requirements, the questions a strong candidate asks before designing, and the most common failure mode (skipping straight to architecture). Use at the start of almost every practice session, and whenever a candidate starts sketching components before establishing scope.
allowed-tools:
  - none (this skill is pure coaching knowledge, no tools required)
---

# Requirements and Framework

This is the phase most candidates skip or rush, and it's the one that determines whether
everything that follows is even relevant — a beautifully designed system that solves the wrong
problem, or is sized for the wrong scale, scores poorly regardless of its technical merit. Coach
this phase deliberately; don't let a candidate move past it in under a minute.

## The core test: could two different candidates end up with two valid, different designs?

If yes — and for almost any real prompt, yes — then requirements clarification isn't optional
box-ticking, it's the step that determines *which* valid design is the right one to build here.
"Design a chat app" could mean a 1:1 messenger, a Slack-style team tool, or a WhatsApp-style
E2E-encrypted consumer app, and each implies a genuinely different architecture.

**Coaching cue:** if a candidate starts sketching boxes within the first minute of an ambiguous
prompt, stop them (in the moment, as their "interviewer") with something a real interviewer would
say: "Before you dive in — what does this system actually need to do?"

## Functional requirements

What the system does, from the user's point of view. Push for a short, prioritized list, not an
exhaustive one — a strong candidate scopes down an ambiguous prompt rather than trying to design
everything.

- "What are the 2-3 core features we should focus on, versus what's out of scope for this
  session?"
- "Who are the users, and what's the primary action they take?"

**Coaching cue:** if a candidate lists ten features with equal weight, ask them to rank the top 2-3
that the rest of the session should focus on. Trying to design everything is itself a signal of
weak prioritization, a skill this phase is meant to demonstrate.

## Non-functional requirements

The requirements that shape the *architecture* more than the feature list does. A strong candidate
asks about these explicitly rather than assuming defaults:

- **Scale**: how many users, how many requests per second, read-heavy or write-heavy (this feeds
  directly into `back-of-envelope-estimation`).
- **Latency**: what response time is acceptable, and does it differ by operation (e.g. posting
  vs. reading a feed)?
- **Availability vs. consistency**: can this tolerate eventual consistency, or does it need strong
  consistency (see `distributed-systems-and-consistency`)? This single question often has the
  largest downstream effect on the whole design.
- **Durability**: can data ever be lost, or must every write survive a failure?
- **Growth**: is this being designed for today's scale or 10x from now? (Over-designing for scale
  that was never asked for is its own mistake — see below.)

**Coaching cue:** if a candidate never asks about read/write ratio or scale, prompt with "how many
users roughly, and is this more of a read-heavy or write-heavy system?" — one of the single most
information-dense clarifying questions in any system design interview.

## Constraints

Practical limits that shape trade-offs: existing infrastructure to integrate with, team size,
budget, compliance/regulatory needs (e.g. data residency), or a stated technology preference from
the interviewer. Less commonly probed in practice interviews than the two categories above, but
worth one clarifying question if the prompt hints at any.

## The two failure modes

- **Skipping this phase entirely** — jumping straight to a high-level design. The most common and
  most costly mistake; everything built afterward inherits the risk of having solved the wrong
  problem.
- **Over-rotating on this phase** — spending 15 of 45 minutes asking questions with no design to
  show for it. Push back if a candidate is still clarifying requirements after a few minutes;
  "you have enough to start designing — what would you sketch first?"

## Stating assumptions when the interviewer doesn't answer

In a real interview, not every clarifying question gets a crisp answer — sometimes the response is
"you tell me" or silence. A strong candidate states a reasonable assumption out loud and moves on,
rather than stalling.

**Coaching cue:** if you (as interviewer) deliberately don't answer a clarifying question and the
candidate stalls waiting for one, prompt: "What would you assume, and why, if I didn't tell you?"

## Selection guidance

| Situation | Reach for |
|---|---|
| Candidate starts designing within the first minute | Stop them, ask "what does this need to do?" |
| Candidate lists many features with no priority | Ask them to rank the top 2-3 |
| Never asked about scale or read/write ratio | Prompt directly — this is the highest-value question to force |
| Never asked about consistency needs | Prompt — feeds directly into the deep-dive and scaling phases |
| Stalled waiting for an answer you deliberately withheld | Ask what they'd assume, and move them forward |
| Spent too long clarifying with no design started | Push them to start sketching |
