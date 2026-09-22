# langchain-agent-kit

Shared LangChain agent building blocks for `whatsap/` and `ai-extension/server/`:
frontmatter parsing (`parseFrontmatter`, `parseMetadataField`, `parseMetadataListField`),
the skills progressive-disclosure middleware (`createSkillMiddleware`, `loadSkills`), and
model-call logging (`createLogModelCallMiddleware`).

Consumed via a `file:` dependency while it stays workspace-local — see each consumer's own
`package.json`. No build step: like both consumers, this package runs directly via Node's
native TypeScript support.

Run this package's own tests: `pnpm test` (from this directory).
