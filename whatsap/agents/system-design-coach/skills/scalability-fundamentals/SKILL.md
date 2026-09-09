---
name: scalability-fundamentals
description: Core scaling vocabulary and reasoning — vertical vs. horizontal scaling, statelessness, load balancing, redundancy — plus the over/under-engineering failure modes. Use whenever a candidate's high-level design needs to justify how it handles more load, or whenever they propose scaling without justifying it against the requirements they gathered.
allowed-tools:
  - none (this skill is pure coaching knowledge, no tools required)
---

# Scalability Fundamentals

The foundational vocabulary underneath almost every other topic skill. Use this to probe whether a
candidate's scaling instincts are grounded in the actual requirements they gathered, or are just
reflexive ("add a cache," "add more servers") without connecting back to a real bottleneck.

## The core test: does the scaling proposal target a real bottleneck?

Any scaling technique proposed should trace back to a specific number or requirement from earlier
in the conversation. "We'd add caching" is not yet an answer — "reads outnumber writes 100:1 at
this scale, so caching read-heavy endpoints removes most of the database load" is.

**Coaching cue:** whenever a candidate proposes a scaling technique, ask "what specifically does
that fix?" If they can't name the bottleneck it addresses, the proposal is decorative, not
reasoned — a very common and very fixable weakness.

## Vertical vs. horizontal scaling

- **Vertical scaling** (bigger machine) — simple, no architecture change needed, but has a hard
  ceiling and a single point of failure.
- **Horizontal scaling** (more machines) — the default answer for anything at real scale, but
  requires the service to be stateless (or to externalize its state) and requires a way to
  distribute load across instances.

**Coaching cue:** if a candidate says "we'll just scale it up" for a system whose requirements
implied real growth, ask "what happens when you hit the ceiling of the biggest machine available?"
— pushes them toward horizontal scaling and its prerequisites.

## Statelessness

Horizontal scaling only works cleanly if any instance can handle any request — which requires
moving session/user state out of the application server and into a shared store (database, cache,
or a distributed session store) rather than keeping it in server memory.

**Coaching cue:** "if this server crashes mid-request, what happens to the user's in-progress
state?" — surfaces whether the candidate has actually thought about statelessness or just said the
word "stateless" without designing for it.

## Load balancing

Distributes incoming traffic across multiple instances. Worth probing at the level of: what
algorithm (round robin, least connections, consistent hashing for cache-affinity cases), and what
happens when one instance is unhealthy (health checks, removal from rotation).

**Coaching cue:** "how does traffic know which instance to go to, and what happens if one instance
goes down?" A candidate who's only said "there's a load balancer" without addressing health
checking has left a real gap.

## Redundancy and single points of failure

Every component in the high-level design should be checked for what happens if it fails. A single
load balancer, a single database instance, a single message queue node — each is a SPOF unless
addressed.

**Coaching cue:** walk the candidate's own diagram with them: "which of these boxes, if it died
right now, would take the whole system down?" This is one of the most effective single questions
for surfacing gaps in a design that otherwise looks complete.

## CDNs and edge caching

For anything serving static or slow-changing content to geographically distributed users, a CDN
should come up. Push for *why* — reduced latency (physically closer to the user) and reduced
origin load, not just "it's faster."

## The two failure modes

- **Under-engineering** — a design that would fall over at the scale established in requirements
  gathering (e.g. a single unsharded database for a system with a billion daily writes).
- **Over-engineering** — proposing a fully sharded, globally-distributed, multi-region active-active
  architecture for a system whose stated requirements don't call for it. This is graded down too —
  it usually signals the candidate is pattern-matching to "impressive-sounding" answers rather than
  reasoning from the actual numbers.

**Coaching cue:** if a design's complexity doesn't match the scale established earlier, ask "does
this match the scale we said we were designing for?" — works in both directions, catching both
failure modes with the same question.

## Selection guidance

| Situation | Reach for |
|---|---|
| Proposed a scaling technique with no stated bottleneck | "What specifically does that fix?" |
| Said "stateless" without addressing session/user state | "What happens to in-progress state if a server crashes?" |
| Load balancer mentioned with no health-check story | "What happens when one instance goes down?" |
| Design looks complete but SPOFs weren't discussed | Walk the diagram: "which box, if it died, takes down the system?" |
| Complexity doesn't match the stated scale (either direction) | "Does this match the scale we said we were designing for?" |
