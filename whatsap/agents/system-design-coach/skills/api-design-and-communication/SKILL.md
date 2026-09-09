---
name: api-design-and-communication
description: REST vs. RPC vs. GraphQL, synchronous vs. asynchronous communication between services, rate limiting, and idempotency — the contract layer that's often sketched too vaguely in the high-level design. Use whenever a candidate's API design stays at "there's an API" without shape, or when service-to-service communication needs to be justified.
allowed-tools:
  - none (this skill is pure coaching knowledge, no tools required)
---

# API Design and Communication

The API layer is frequently the most under-specified part of a high-level design — candidates
draw a box labeled "API" between the client and the backend and move on. A strong candidate can at
least roughly sketch the shape of the 2-3 core endpoints and justify the communication style
between services.

## The core test: could you write the client code against this API right now?

If the candidate's description is specific enough that you could sketch a real request (method,
rough path or RPC call, key parameters) and a rough response shape, the API design has actually
happened. If it's still "the client calls the API," it hasn't yet.

**Coaching cue:** "sketch the actual request for the core action — what would the client send?"
Push for something concrete, even informally: `POST /shorten { url }` → `{ shortUrl }`, not just
"there's an endpoint for that."

## REST vs. RPC vs. GraphQL

- **REST** — resource-oriented (nouns + HTTP verbs), widely understood, good default for
  client-facing CRUD-shaped APIs, cacheable via standard HTTP semantics.
- **RPC** (gRPC and similar) — action-oriented (call a named function), typically more efficient
  (binary protocol, strongly typed contracts), common for service-to-service communication inside
  a system rather than client-facing.
- **GraphQL** — client specifies exactly the fields it needs in one request, avoids
  over-fetching/under-fetching and multiple round trips for composed views. Good fit when clients
  have very different data needs from the same underlying resources (e.g. mobile vs. web needing
  different subsets of a user profile).

**Coaching cue:** if a candidate defaults to REST without considering the alternatives, ask "would
this benefit from a client picking exactly the fields it needs, or is this internal
service-to-service traffic where REST's overhead might not be worth it?" — tests awareness of the
trade-off space, not memorization of a "right" answer (there usually isn't one right answer here).

## Synchronous vs. asynchronous communication between services

- **Synchronous** (a service calls another and waits for a response) — simpler to reason about,
  but couples the caller's latency and availability to the callee's.
  - **Coaching cue:** "if service B is slow or down, what happens to service A's response time?" —
    surfaces whether they've thought about cascading failure risk (ties to
    `reliability-and-fault-tolerance`).
- **Asynchronous** (via a queue/event, see `messaging-and-async-processing`) — decouples the
  services, at the cost of the caller not getting an immediate result.

## Idempotency

An operation is idempotent if performing it multiple times has the same effect as performing it
once. Critical for any API where a client might retry a request (network timeout, no response
received) without knowing whether the first attempt actually succeeded.

**Coaching cue:** "if the client sends this request, gets no response due to a network blip, and
retries — what happens?" For anything with a side effect (charging a payment, creating an order),
a candidate should propose an **idempotency key** (client-generated unique ID per logical
operation, checked server-side to detect and no-op a duplicate) rather than leaving this
unaddressed.

## Rate limiting

Protects the system from being overwhelmed by a single client (accidental or malicious) and can be
a component in its own right in some prompts. Worth naming the mechanism at a high level: **token
bucket** (allows bursts up to a capacity, refills at a steady rate — the most commonly cited
approach) or **sliding window** (smoother, more precise, more state to track).

**Coaching cue:** if the prompt or design has any public-facing API with real scale, ask "what stops
one client from overwhelming this?" if rate limiting hasn't come up on its own.

## API gateway

For systems with multiple backend services, a gateway centralizes cross-cutting concerns
(authentication, rate limiting, request routing) rather than duplicating them in every service.
Worth a mention in any multi-service design, without needing deep elaboration unless it's the
deep-dive target.

## Selection guidance

| Situation | Reach for |
|---|---|
| API described only as "there's an API" | Ask for a concrete sketch of the core request/response |
| REST chosen with no consideration of alternatives | Ask about client field-selection needs (GraphQL) or internal-traffic overhead (RPC) |
| Service-to-service call with no failure-mode discussion | Ask what happens to the caller if the callee is slow or down |
| Client retries never addressed | Ask what happens on a network-blip retry; push toward idempotency keys |
| Public-facing API, no rate limiting discussed | Ask what stops one client from overwhelming it |
