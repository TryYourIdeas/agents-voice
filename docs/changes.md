# Changes

## 2026-09-22 — Extract langchain-agent-kit shared package

`whatsap/` and `ai-extension/server/` each ran their own copy of frontmatter parsing, the
skills progressive-disclosure middleware, and model-call logging — copies that had drifted
(`whatsap`'s skill-middleware gained multi-agent `extraDirs`/`allowedSkills` support that
`ai-extension`'s never got). Extracted all three into `lib/langchain-agent-kit/`, a shared
TypeScript package consumed via a `file:` dependency by both. No behavior change to either
agent. See `docs/superpowers/specs/2026-09-22-langchain-agent-kit-extraction-design.md`.

File/directory/bash tools remain project-specific for now (deferred to a follow-up PR —
they take different shapes between the two agents).
