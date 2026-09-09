// shared.ts throws at import time if ANTHROPIC_MODEL isn't set (see
// whatsap/CLAUDE.md) — real for the running bot, but a problem for tests
// like scheduler.test.ts that only need a pure function (isDue) and
// transitively import shared.ts through scheduler.ts -> agent.ts. Falling
// back to a placeholder here keeps the suite runnable without a real .env
// (CI, a fresh clone) for any test that never actually calls the model.
process.env.ANTHROPIC_MODEL ||= "test-model";
