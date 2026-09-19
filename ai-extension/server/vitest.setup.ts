// agent.ts throws at import time if ANTHROPIC_MODEL isn't set. Tests that
// only exercise pure logic (context.ts, frontmatter.ts) transitively import
// it through http.ts/agent.ts, so default it here — same pattern as
// whatsap/vitest.setup.ts.
process.env.ANTHROPIC_MODEL ||= "test-model";
process.env.ANTHROPIC_API_KEY ||= "test-key";
process.env.EXTENSION_ID ||= "test-extension-id";
