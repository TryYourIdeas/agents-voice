# ADR: Independent agent copy instead of a shared agent-core package

Date: 2026-09-19
Status: Accepted

## Context

`ai-extension/server` needs a LangChain + `ChatAnthropic` agent with file/directory/bash
tools and a skill system — the same shape as `whatsap/agent.ts`. Two options were
considered: (1) give `ai-extension/server` its own independent copy of that code, or (2)
extract the shared shape into a package both `whatsap` and `ai-extension/server` depend on.

## Decision

Independent copy. `ai-extension/server` has its own `agent.ts`, `tools/`, `middleware/`,
and `skills/`, not imported from `whatsap/`.

## Consequences

- `whatsap` and `ai-extension` can evolve, deploy, and be tested independently — a change
  to whatsap's multi-device support or named-agent delegation (which `ai-extension/server`
  doesn't need) can't break the extension's server, and vice versa.
- Some tool/middleware code (frontmatter parsing, skill loading, bash/file tools, logging
  middleware) is duplicated between the two projects.
- If that duplication becomes a maintenance burden — e.g. a bug fixed in one copy but not
  the other — revisit and extract a shared package at that point, per the top-level
  `web/CLAUDE.md` shared-libraries guidance. Deferred for now per the design spec's backlog.
