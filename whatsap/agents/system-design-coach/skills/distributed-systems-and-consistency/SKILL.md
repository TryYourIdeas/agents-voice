---
name: distributed-systems-and-consistency
description: CAP theorem, consistency models (strong vs. eventual), and coordination primitives (leader election, distributed locks, consensus) — the concepts behind the single highest-leverage clarifying question in system design. Use whenever availability-vs-consistency tension is relevant, or a candidate needs to justify a consistency choice.
allowed-tools:
  - none (this skill is pure coaching knowledge, no tools required)
---

# Distributed Systems and Consistency

Consistency requirements shape more of a system's architecture than almost any other single
decision — replication strategy, database choice, caching strategy, and conflict handling all
trace back to it. This skill is about making sure that decision is made deliberately and stated
out loud, not defaulted into silently.

## The core test: did the candidate choose a consistency model, or drift into one?

A strong candidate states, explicitly, what consistency guarantee a given piece of data needs and
why — then designs to match it. A weak answer just picks technologies (a NoSQL database, an async
queue) whose consistency implications were never actually decided on purpose.

**Coaching cue:** "if two users read this data at the same instant, right after someone else wrote
it, could they see different values — and is that okay?" One question, directly tests whether a
consistency decision was made on purpose.

## CAP theorem, briefly and practically

In the presence of a network partition, a distributed system must choose between **consistency**
(every read sees the latest write) and **availability** (every request gets a response, even if
it might not be the latest data). This isn't an abstract theorem to recite — it's a real trade-off
that should show up as a specific decision for specific data in the design.

**Coaching cue:** don't accept "CAP theorem" as a name-drop with no application. "Okay — for this
specific piece of data, which one are you choosing, and what does the system do during a
partition?"

## Strong vs. eventual consistency

- **Strong consistency** — every read reflects the most recent write. Needed for data where
  staleness causes real problems (account balances, inventory counts, anything where two readers
  disagreeing is a correctness bug, not just an inconvenience).
- **Eventual consistency** — reads may return stale data for some window after a write, but the
  system converges eventually. Acceptable, often preferable, for data where brief staleness is
  harmless (social media like counts, view counts, presence indicators) — trading it for
  availability and lower latency.

**Coaching cue:** push candidates to justify per piece of data, not per whole system — a real design
usually mixes both (e.g. strong consistency for a payment record, eventual consistency for a
follower count on the same platform). "Does every piece of data in this system need the same
consistency guarantee?"

## Coordination primitives (name-recognition level, not implementation depth)

These come up in deep dives on distributed components; candidates should recognize the concept and
when it's needed, without necessarily implementing the algorithm live.

- **Leader election** — choosing one node to coordinate a task (e.g. the leader in leader-follower
  replication) so multiple nodes don't conflict. Comes up when a candidate's design has multiple
  instances that need to agree on something.
- **Distributed locks** — preventing two nodes from concurrently modifying the same resource.
  Worth probing whenever a candidate's design has multiple workers/instances that could race on
  the same piece of work (e.g. two workers both trying to process the same queued job).
- **Consensus (e.g. Raft/Paxos, by name only)** — how a distributed group of nodes agrees on a
  single value despite failures. Rarely needs deep explanation in an interview; recognizing that
  "the nodes need to agree on X" is a consensus problem is usually sufficient.

**Coaching cue:** "if two instances of this worker both picked up the same job, what happens?" —
surfaces whether a distributed-locking or leader-election gap exists in a design with multiple
workers, without needing to name the theory directly.

## Distributed transactions (name-recognition level)

When an operation must atomically update data across multiple services/databases. Worth a brief
mention of the **saga pattern** (a sequence of local transactions with compensating actions on
failure) as the practical, commonly-used approach in modern microservice systems, versus **two-phase
commit** (stronger guarantee, but blocking and harder to scale — usually not the expected answer
unless the candidate is going deep on this specifically).

**Coaching cue:** "if step 3 of this multi-service operation fails, what happens to steps 1 and 2
that already succeeded?" — a strong, concrete way to surface whether the candidate has thought
about this at all, without requiring them to name "saga pattern" specifically.

## Selection guidance

| Situation | Reach for |
|---|---|
| Consistency model never stated explicitly | Ask the "two users read at the same instant" question |
| CAP theorem name-dropped with no application | Ask what the system does during a partition, for this specific data |
| Whole system assumed to need the same consistency level | Ask if every piece of data needs the same guarantee |
| Multiple workers/instances with no coordination discussed | Ask what happens if two instances grab the same job |
| Multi-service operation with no failure-handling discussed | Ask what happens if a later step fails after earlier ones succeeded |
