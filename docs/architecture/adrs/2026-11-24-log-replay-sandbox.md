# ADR: Replay logged turns in a sandbox built from mock tools

Date: 2026-11-24 · Status: implemented on `feat/log-replay-sandbox`

## Context
The owner wants to see how another reasoning model would have handled a logged interaction. A replay re-runs the agent, whose tools can message people, send mail, write files and run bash.

## Decision
- A replay runs in the `whatsap` bot with its **own** agent: its own `ChatAnthropic` (from a model configuration) and a tool list made of **mock tools** over an in-memory `Sandbox` (chat, files, mailbox). Real stateful tools are not in the list at all (rejected: a "replay" flag inside each real tool — one missed check from a real send).
- The sandbox starts from what the original run saw, rebuilt from its logged tool results (rejected: a copy of the live device folder and inbox — copies private data; an empty sandbox — needs manual fixtures).
- Sandbox state is stored in the logs DB (`replay_*` tables) and read by the UI read-only; the UI starts a replay through the bot's internal API (`POST /api/replay`).
- Model configurations live in `logs/model-configs.db`, written by the UI, read by the bot by id; API keys are plain text at rest and never returned to the browser.
- Delegation to named agents works in replays through an injected runner (`createAgentDelegationMiddleware`, `lib/replay/delegate.ts`): the named agent keeps its own `agent.md` prompt, skills and allowed-tools but runs with the replay model and the mock tools, over the shared sandbox, logged as a child turn. Vision routing, `execute_bash`, scheduled tasks and the post pipeline are excluded; `web_search` writes its research files to the sandbox. A test checks every named agent's allowed-tools exist in a replay.

## Consequences
Replays are safe by construction but not perfectly faithful (text only, seeds limited to what was logged and not truncated). Adding a new stateful tool means adding its mock to `tools/replay/` or it is absent from replays.
