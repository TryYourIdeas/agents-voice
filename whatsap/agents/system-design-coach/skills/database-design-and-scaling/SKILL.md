---
name: database-design-and-scaling
description: SQL vs. NoSQL trade-offs, indexing, replication, and sharding/partitioning strategies — the most commonly deep-dived component in system design interviews. Use whenever a candidate picks a database technology without justifying it, or when the deep dive lands on data storage/scaling.
allowed-tools:
  - none (this skill is pure coaching knowledge, no tools required)
---

# Database Design and Scaling

The database choice and its scaling strategy is one of the most frequent deep-dive targets in
system design interviews, and one of the easiest places to spot a candidate reciting buzzwords
("we'll use NoSQL for scale") versus reasoning from the actual access pattern.

## The core test: does the data model justify the database choice?

A strong answer names the actual access pattern (queries needed, relationships between entities,
consistency needs) and picks a database that fits it — not the reverse. "NoSQL because it scales"
is not yet a justification; SQL databases scale too, and plenty of NoSQL choices scale poorly for
the wrong access pattern.

**Coaching cue:** "walk me through the 2-3 queries this database needs to answer well" — then ask
whether the chosen database/schema actually answers them efficiently. This is usually more
revealing than asking "why NoSQL?" directly.

## SQL vs. NoSQL

- **SQL (relational)** — strong consistency guarantees, joins, well-suited to data with clear
  relationships and where ad-hoc querying matters. Harder to horizontally scale writes (though not
  impossible — see sharding below).
- **NoSQL** — several distinct sub-categories, each suited to different access patterns:
  - **Key-value** (e.g. Redis, DynamoDB) — simplest, fastest for lookups by a known key.
  - **Document** (e.g. MongoDB) — flexible schema, good for data that's naturally nested and
    usually read/written as a whole document.
  - **Wide-column** (e.g. Cassandra) — optimized for very high write throughput and queries that
    filter on a known partition key; weaker for ad-hoc queries across other fields.
  - **Graph** (e.g. Neo4j) — relationships are the primary query pattern (social graphs,
    recommendation engines).

**Coaching cue:** if a candidate says "NoSQL" without naming which kind, ask "which kind, and why
that one specifically for this data?" — "NoSQL" alone is not a complete answer any more than "a
database" would be.

## Indexing

The mechanism that makes the chosen queries fast. Worth a specific question whenever query
patterns have been named: "what would you index on, given those queries?" A candidate who's
designed a schema but never mentions an index has left an important, easy-to-catch gap — and one
who proposes indexing every column hasn't considered the write-cost trade-off of each index.

## Replication

Copies of the data on multiple nodes, for both availability (survive a node failure) and read
scaling (serve reads from replicas).

- **Leader-follower (primary-replica)** — writes go to one leader, reads can be served from
  replicas. Simple, but replicas can lag behind the leader (replication lag) — a source of
  eventual consistency worth naming explicitly (see `distributed-systems-and-consistency`).
- **Multi-leader / leaderless** — writes accepted at multiple nodes, more complex conflict
  resolution, used when write availability across regions matters more than simplicity.

**Coaching cue:** "if a user reads right after writing, could they read stale data here?" — tests
whether the candidate has actually reasoned about replication lag rather than just naming
"replicas" as a scaling technique.

## Sharding / partitioning

Splitting data across multiple database instances so no single node holds (or serves) all of it —
the primary technique for scaling writes past what a single machine can handle.

- **Choosing a shard key** — the single most important and most commonly under-discussed decision.
  A bad shard key creates hot shards (uneven load) or makes common queries need to fan out across
  every shard.
- **Range-based sharding** — simple, but can create hotspots if access patterns cluster (e.g.
  sequential IDs, all-recent-data-heavy access).
- **Hash-based sharding** — spreads load more evenly, at the cost of losing efficient range
  queries.
- **Resharding** — what happens when a shard outgrows capacity; worth a brief mention that this is
  operationally hard, even if not designed in full detail.

**Coaching cue:** "what would you shard on, and what's the risk with that choice?" — a candidate who
picks a shard key without considering hotspots (e.g. sharding a time-series system by day, so all
current writes hit one shard) has a specific, findable flaw worth surfacing.

## Selection guidance

| Situation | Reach for |
|---|---|
| Database choice stated with no access-pattern justification | Ask for the 2-3 queries it needs to answer well |
| "NoSQL" with no sub-category named | Ask which kind, and why |
| Schema designed with no mention of indexes | Ask what they'd index on |
| Replication mentioned as a scaling technique | Ask about read-after-write staleness |
| Sharding proposed with no shard key reasoning | Ask what they'd shard on, and what could go wrong with it |
