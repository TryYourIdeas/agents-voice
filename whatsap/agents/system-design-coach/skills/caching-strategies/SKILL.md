---
name: caching-strategies
description: Cache placement, read/write strategies (cache-aside, write-through, write-back), eviction policies, and invalidation — the hardest part of caching to get right. Use whenever a candidate proposes "adding a cache" without specifying how it's kept correct, or when a read-heavy component needs a caching strategy in the deep dive.
allowed-tools:
  - none (this skill is pure coaching knowledge, no tools required)
---

# Caching Strategies

"We'd add a cache" is one of the most common under-specified answers in a system design interview.
Caching is easy to gesture at and genuinely hard to get right — the interesting parts are how it's
kept consistent with the source of truth and what happens when it's wrong, not the fact that one
exists. Push past the gesture to the mechanics.

## The core test: what happens on a cache miss, and what happens when the cache is wrong?

Every caching proposal should have clear answers to both. A candidate who's only described the
happy path (data is in the cache, return it fast) hasn't finished the answer.

**Coaching cue:** "walk me through what happens on a cache miss" and separately "what happens if
the cached value is stale — how does that get fixed?" Two distinct, both necessary questions.

## Read strategies

- **Cache-aside (lazy loading)** — application checks cache first; on a miss, reads from the
  database and populates the cache. Simple, cache only holds what's actually requested, but the
  first request after a miss/eviction pays full latency, and there's a window where cache and DB
  can disagree.
- **Read-through** — the cache itself is responsible for loading from the database on a miss
  (application only ever talks to the cache). Similar trade-offs to cache-aside, different
  ownership of the loading logic.

**Coaching cue:** "who's responsible for loading data into the cache on a miss — the application or
the cache layer itself?" surfaces whether they know these are different patterns, not just "there's
a cache."

## Write strategies

- **Write-through** — writes go to the cache and the database together (synchronously). Cache
  stays consistent, but write latency includes both.
- **Write-back (write-behind)** — writes go to the cache immediately and are flushed to the
  database asynchronously. Fast writes, but risks data loss if the cache fails before flushing —
  needs an explicit answer for durability if proposed.
- **Write-around** — writes go directly to the database, bypassing the cache; the cache only fills
  on subsequent reads. Avoids caching data that's written but rarely read again, at the cost of a
  guaranteed miss on the next read after a write.

**Coaching cue:** if write-back is proposed, always ask "what happens to writes sitting in the
cache if it crashes before flushing?" — this is the single most important gap in that strategy, and
a strong candidate should name it themselves, not need it pointed out.

## Eviction policies

When the cache is full, something must be evicted. **LRU** (least recently used) is the default,
generally-correct answer for most access patterns; **LFU** (least frequently used) suits access
patterns with a stable "hot set" that shouldn't be evicted by a burst of one-off reads; **TTL-based**
expiry suits data with a natural freshness window regardless of access pattern.

**Coaching cue:** "what happens when the cache is full and a new item needs to go in?" — a
surprising number of candidates never address eviction at all.

## Invalidation — "the hardest problem in computer science" for a reason

The core difficulty: keeping cached data from silently diverging from the source of truth.
Approaches worth naming: **TTL expiry** (simple, but data can be stale for up to the TTL window),
**explicit invalidation on write** (delete or update the cache entry when the underlying data
changes — correct but requires the write path to remember to do it, and is hard to do correctly
across multiple cache layers), **versioned/tagged cache keys** (change the key when the underlying
data changes, so old entries simply age out unused).

**Coaching cue:** "if this data changes, how does the cache find out?" — if the answer is "it just
expires eventually," push on whether that staleness window is acceptable given the non-functional
requirements established earlier (see `requirements-and-framework`).

## Cache placement

- **Client-side / browser cache** — closest to the user, but out of the system's control.
- **CDN / edge cache** — for content shared across many users, geographically distributed.
- **Application-level distributed cache** (Redis, Memcached) — the most commonly discussed layer
  in interviews; shared across application instances, sits between app and database.
- **Database-internal cache / buffer pool** — usually not something the candidate needs to design,
  but worth knowing it exists so they don't reinvent it unnecessarily.

## Selection guidance

| Situation | Reach for |
|---|---|
| "We'd add a cache" with no further detail | Ask what happens on a miss, and what happens when it's wrong |
| Read strategy unspecified | Ask who loads the cache on a miss — app or cache layer |
| Write-back proposed | Ask about data loss if the cache crashes before flushing |
| Eviction never addressed | Ask what happens when the cache is full |
| Staleness/invalidation never addressed | Ask how the cache finds out data changed, and whether that's acceptable |
