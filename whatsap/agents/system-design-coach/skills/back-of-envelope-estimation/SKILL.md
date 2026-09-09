---
name: back-of-envelope-estimation
description: How to coach capacity estimation — QPS, storage, and bandwidth math — including the reference numbers worth memorizing and the most common candidate mistakes (skipping it, or getting lost in precision that doesn't matter). Use right after requirements gathering, before or during the high-level design, whenever scale numbers should inform an architectural choice.
allowed-tools:
  - none (this skill is pure coaching knowledge, no tools required)
---

# Back-of-Envelope Estimation

A specific, commonly-tested skill on its own — and one candidates often skip entirely, or get lost
in unnecessary precision when they do attempt it. The point isn't precision; it's producing a
rough number fast enough that it can actually inform a design decision later in the same
conversation.

## The core test: did the estimate actually get used?

A number calculated and then never referenced again is wasted effort — worse, it signals the
candidate treats estimation as a ritual rather than a tool. A strong session has the estimate come
back up later: "given the 50K QPS we estimated, a single database instance won't keep up here."

**Coaching cue:** if a candidate calculates numbers early and then never mentions them again during
the design, ask later: "does this design hold up against the number we calculated earlier?"

## The core method

1. Start from the requirements already gathered (users, growth, read/write ratio — see
   `requirements-and-framework`).
2. Convert to **requests per second (QPS)** — usually the single most useful number, since it
   directly informs how many instances/shards are needed.
3. Estimate **storage** — size of one record × number of records, projected over a stated time
   window (e.g. "5 years of data").
4. Estimate **bandwidth** — size of a typical request/response × QPS.
5. Round aggressively at every step. The goal is the right order of magnitude, not a precise
   figure — a candidate who spends three minutes getting exact digits right has mis-prioritized
   interview time.

**Coaching cue:** if a candidate is deep into precise arithmetic (e.g. multiplying out exact daily
active user percentages to several decimal places), redirect: "round that — we just need the right
order of magnitude to decide whether we need one server or a hundred."

## Useful reference numbers worth having ready

These come up often enough that memorizing rough values saves real time in an interview:

- **Seconds in a day**: ~86,400 (candidates commonly round to ~100,000 for quick mental math,
  which is fine for order-of-magnitude estimation).
- **1 KB** = 1,000 bytes (roughly, for estimation purposes); a typical short text record (a tweet,
  a chat message) is a few hundred bytes to a couple KB.
- **1 million requests/day** ≈ ~12 QPS average — a useful anchor ratio: divide daily volume by
  ~100,000 for a rough average QPS.
- **Peak traffic** is typically 2-3x the average — always ask (or state the assumption) whether the
  design needs to handle peak or just average, since this materially changes capacity needs.
- **A single modern server** can typically handle on the order of a few thousand to low tens of
  thousands of simple requests per second, depending heavily on what the request actually does —
  useful for reasoning about roughly how many instances a given QPS implies, not as a precise
  figure.

**Coaching cue:** if a candidate doesn't know where to start, prompt with the anchor ratio: "if you
have this many daily active users doing this action once a day, roughly how many requests per
second is that on average?"

## Peak vs. average, and read vs. write

Two dimensions worth explicitly separating in any estimate:

- **Average vs. peak QPS** — a system sized only for average load will fall over during peak
  (product launches, daily peak hours, viral moments). State both, and design for peak.
- **Read QPS vs. write QPS** — usually very different for real systems (most consumer systems are
  read-heavy, often by 10-100x), and this ratio directly determines whether caching and read
  replicas are worth the complexity they add.

**Coaching cue:** "is that the average, or the peak? And is that reads, writes, or both combined?" —
a single clarifying pair of questions that catches most estimation gaps.

## The two failure modes

- **Skipping it entirely** — moving straight from requirements to architecture with no numbers at
  all, leaving every scaling decision unjustified.
- **Over-investing in precision** — treating this as a math exam rather than a fast sanity check,
  burning interview time that should go toward the design itself.

## Selection guidance

| Situation | Reach for |
|---|---|
| No estimation attempted at all | Prompt directly: "roughly how many requests per second are we talking about?" |
| Estimate calculated, never referenced again | Ask later whether the design holds up against that number |
| Getting lost in precise arithmetic | Redirect toward rounding and order-of-magnitude |
| Doesn't know where to start | Give the anchor ratio (daily volume ÷ ~100,000 ≈ average QPS) |
| Average/peak or read/write not distinguished | Ask which one the number represents |
