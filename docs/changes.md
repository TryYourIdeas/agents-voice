# Changes

## 2026-09-24 — Fix `docker-compose-whatsap.yml` crash-loop on `whatsap`/`ai-extension-server`

Both services crashed on startup with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` when
importing `langchain-agent-kit`. Root cause: pnpm's `file:` protocol packs the dependency's
directory into `node_modules` (copy, not a live symlink to `lib/langchain-agent-kit`), so its
raw `.ts` source physically lives under `node_modules` — and Node's native TypeScript
type-stripping refuses to strip types for anything there, with no override flag. Fixed by
giving `lib/langchain-agent-kit` a `build` script (`tsc -p tsconfig.build.json`) that compiles
`src/*.ts` to `dist/*.js`, pointing `package.json`'s `exports`/`types` at `dist`, and building
it in both `whatsap/Dockerfile` and `ai-extension/server/Dockerfile` (via `npm --prefix
/lib/langchain-agent-kit install --include=dev && npm --prefix /lib/langchain-agent-kit run
build`, before the consumer's own `pnpm install`) so the packed dependency only ever contains
compiled JS. Also added `lib/langchain-agent-kit/.npmignore` (just `node_modules`) — pnpm's
local-path packing follows `.gitignore`/`.npmignore` rather than `package.json`'s `files`
field, so `dist` being in `.gitignore` (for git purposes) was otherwise excluding it from the
pack too.

## 2026-09-22 — Extract langchain-agent-kit shared package

`whatsap/` and `ai-extension/server/` each ran their own copy of frontmatter parsing, the
skills progressive-disclosure middleware, and model-call logging — copies that had drifted
(`whatsap`'s skill-middleware gained multi-agent `extraDirs`/`allowedSkills` support that
`ai-extension`'s never got). Extracted all three into `lib/langchain-agent-kit/`, a shared
TypeScript package consumed via a `file:` dependency by both. No behavior change to either
agent. See `docs/superpowers/specs/2026-09-22-langchain-agent-kit-extraction-design.md`.

File/directory/bash tools remain project-specific for now (deferred to a follow-up PR —
they take different shapes between the two agents).
