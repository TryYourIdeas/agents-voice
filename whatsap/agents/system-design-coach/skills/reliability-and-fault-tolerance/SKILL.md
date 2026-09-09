---
name: reliability-and-fault-tolerance
description: Failure handling — redundancy, failover, health checks, graceful degradation, monitoring, and cascading-failure prevention (circuit breakers, timeouts, retries with backoff). Use during the scale-and-bottlenecks phase, or whenever a design hasn't addressed what happens when a component fails.
allowed-tools:
  - none (this skill is pure coaching knowledge, no tools required)
---

# Reliability and Fault Tolerance

Most candidates design the happy path fluently and only address failure when explicitly asked.
This skill is about the questions that surface failure-mode gaps proactively, since a strong
candidate should be raising some of these unprompted, not only when pressed.

## The core test: does every component's failure have a stated consequence?

For each major component in the design, there should be an answer (even a brief one) to "what
happens when this fails?" A design that's silent on this for its database, its queue, or its
critical service has an incomplete answer, regardless of how good the happy-path design is.

**Coaching cue:** walk the candidate's own diagram, component by component: "what happens if this
one goes down?" Repeating this question across the whole design is one of the highest-yield
techniques in this entire coaching agent.

## Redundancy and failover

Running multiple instances of a component so one failing doesn't take down the system — covered at
the general level in `scalability-fundamentals`; the reliability-specific question is *how the
system detects the failure and reacts*.

- **Health checks** — how does the system know an instance is unhealthy? (Heartbeats, periodic
  probes.)
- **Failover** — what happens once a failure is detected? (Traffic rerouted to healthy instances,
  a standby promoted to primary.)

**Coaching cue:** "how does the system know that instance is down, and how long does it take to
notice?" — pushes past "there's redundancy" to the actual detection-and-recovery mechanism.

## Graceful degradation

When a non-critical dependency fails, a well-designed system keeps serving reduced functionality
rather than failing entirely. E.g. if a recommendation service is down, a product page can still
load without personalized recommendations, rather than the whole page failing.

**Coaching cue:** "if this particular dependency is down, does the whole request fail, or can the
system serve something useful anyway?" Especially valuable to ask about non-critical-looking
components the candidate added — a good test of whether they've distinguished "core" from
"enhancement" functionality.

## Cascading failure prevention

A failure or slowdown in one service that, left unchecked, takes down services that depend on it —
one of the most realistic and highly-regarded things to proactively address in a senior-level
answer.

- **Timeouts** — every synchronous call to another service needs a timeout; without one, a slow
  dependency can hold resources indefinitely and starve the calling service too.
- **Circuit breakers** — after repeated failures calling a dependency, stop calling it for a cooldown
  period (failing fast) rather than continuing to pile up slow, doomed requests.
- **Retries with backoff (and jitter)** — retrying a failed call is reasonable, but retrying
  immediately and aggressively can itself overwhelm an already-struggling dependency; exponential
  backoff (waiting longer between each retry) with jitter (randomizing the wait slightly, so many
  clients don't retry in lockstep) avoids amplifying the problem.

**Coaching cue:** "if service B is failing, what stops service A's problem from becoming everyone's
problem?" — a strong prompt for surfacing whether cascading-failure protection has been considered
at all. Especially worth raising at level 4-5 (see agent.md's Levels) where multi-service designs
make this realistic.

## Monitoring and alerting

Briefly worth naming in a wrap-up, even without deep elaboration: what would need to be monitored
to know this system is healthy in production (error rates, latency percentiles, queue depth), and
what would trigger a page. Not usually a deep-dive target, but its complete absence from a
design's wrap-up is itself a minor gap worth noting in feedback.

**Coaching cue:** near the end of a session, if it hasn't come up: "how would you know if this
system was unhealthy in production, before users started complaining?"

## Data durability vs. availability

Distinct from the CAP-theorem availability/consistency trade-off (`distributed-systems-and-consistency`)
— durability is about whether acknowledged writes can ever be lost (e.g. due to a crash before
data was persisted to durable storage), which matters most when write-back caching or
asynchronous replication is in play.

**Coaching cue:** if write-back caching or async replication was proposed, tie back: "if this node
crashes right after acknowledging the write, but before it's persisted downstream — is that data
gone?"

## Selection guidance

| Situation | Reach for |
|---|---|
| Design is silent on any component's failure | Walk the diagram: "what happens if this one goes down?" |
| Redundancy mentioned with no detection/recovery mechanism | Ask how the system knows, and how fast it reacts |
| Non-critical dependency with no degradation story | Ask if the whole request fails or the system serves something useful anyway |
| Multi-service design, no cascading-failure discussion | Ask what stops one service's problem from becoming everyone's |
| Write-back caching or async replication proposed | Ask about data loss on a crash before persistence |
| No mention of monitoring by the end of the session | Ask how they'd know the system was unhealthy before users complained |
