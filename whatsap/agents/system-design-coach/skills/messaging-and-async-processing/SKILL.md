---
name: messaging-and-async-processing
description: Message queues vs. pub/sub, delivery guarantees, ordering, and when async processing is the right call versus an unnecessary complication. Use whenever a candidate's design involves background work, decoupled services, or a workload with bursty/uneven load.
allowed-tools:
  - none (this skill is pure coaching knowledge, no tools required)
---

# Messaging and Async Processing

Async processing is a genuinely powerful tool and also one of the most over-applied ones in
interview answers — candidates sometimes reach for "we'll put it on a queue" as a reflex whenever
a design feels like it needs more sophistication, without weighing whether the work actually needs
to happen asynchronously. Coach both the mechanics and the judgment call of when to use it.

## The core test: does this work need to happen synchronously with the user's request, or not?

If the user is waiting on the result (e.g. "did my payment succeed?"), it belongs in the
synchronous path or needs a clear async-with-status-check design. If the work can happen after the
response is already sent (sending a notification email, updating a recommendation index), it's a
good candidate for a queue.

**Coaching cue:** "does the user need to wait for this to finish, or could they get a response
before it's actually done?" — the single question that determines whether async processing is even
the right tool here.

## Message queues (point-to-point)

One producer, one consumer (or a pool of consumers competing for messages) — each message is
processed once, by one consumer. Good for distributing work across a pool of workers (e.g. image
processing jobs, sending emails).

**Coaching cue:** "if you have multiple worker instances, how do you make sure two of them don't
process the same message?" — most managed queues handle this (visibility timeouts, at-least-once
delivery with idempotent consumers), but the candidate should know this is a real concern, not an
assumed non-issue.

## Publish/subscribe (pub/sub)

One producer, multiple independent consumers, each of which receives a copy of every message.
Good for fanning an event out to multiple downstream systems that each need to react to it
independently (e.g. a "user signed up" event triggering an email service, an analytics pipeline,
and a fraud-check service, all independently).

**Coaching cue:** if a candidate's design has multiple systems that each need to react to the same
event, and they've proposed a plain queue, ask "if you add a fourth system that also needs to know
about this event, does your current design handle that cleanly?" — usually surfaces that pub/sub,
not a queue, is the better fit.

## Delivery guarantees

- **At-most-once** — a message might be lost, but never processed twice. Rarely the right choice
  for anything that matters.
- **At-least-once** — a message is guaranteed to be delivered, but might be delivered more than
  once (e.g. after a consumer crashes mid-processing and the message is redelivered). The most
  common real-world default — which means **consumers must be idempotent** (processing the same
  message twice has the same effect as processing it once).
- **Exactly-once** — the ideal, genuinely hard to guarantee end-to-end in a distributed system;
  usually achieved in practice by combining at-least-once delivery with idempotent processing
  rather than a true exactly-once mechanism.

**Coaching cue:** "what happens if this message gets delivered twice?" — should be asked of nearly
any queue-based design; if the answer is "that would be a problem," the consumer isn't idempotent
yet and that's a real gap worth naming.

## Ordering

Most distributed queues don't guarantee global ordering across all messages by default — only
guaranteed within a single partition/shard of the queue (if the technology supports partitioning
by key). Worth asking whenever ordering plausibly matters for correctness (e.g. "user updated their
profile" events must be applied in the order they happened).

**Coaching cue:** "does the order these messages get processed in matter here? If two arrive out of
order, is that a problem?"

## Batch vs. stream processing

- **Batch** — processing accumulated data on a schedule (nightly reports, periodic
  recomputation). Simpler, higher latency, fine when near-real-time isn't required.
- **Stream** — processing events as they arrive, continuously. Needed when the requirement is
  closer to real-time (live dashboards, fraud detection that needs to act within seconds).

**Coaching cue:** ties directly back to non-functional requirements gathered earlier — "does this
need to be real-time, or would an hourly/nightly batch job satisfy the requirement?" A candidate
who defaults to streaming for something that could be a nightly batch job is over-engineering.

## Selection guidance

| Situation | Reach for |
|---|---|
| Work proposed for a queue with no reasoning | Ask if the user needs to wait for it to finish |
| Multiple downstream systems need the same event | Ask whether a plain queue scales to a 4th consumer, nudge toward pub/sub |
| Queue proposed with no idempotency discussion | Ask what happens if a message is delivered twice |
| Ordering-sensitive events, no ordering guarantee discussed | Ask if out-of-order processing would be a problem |
| Streaming proposed for something that could be a batch job | Ask if it actually needs to be real-time |
