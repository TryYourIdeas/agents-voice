# wwebjs-bot

A WhatsApp bot (`whatsapp-web.js`) that forwards `@ai`-prefixed messages to a LangChain agent backed by Anthropic's Messages API.

## Prerequisites

- Node v26 (this repo runs TypeScript files directly via Node's native TS support — no build step)
- [pnpm](https://pnpm.io/) `10.30.0` (pinned via `packageManager` in `package.json`)
- An Anthropic API key

## Setup

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Configure environment variables. Copy `.env.example` to `.env` and fill in:

   ```sh
   cp .env.example .env
   ```

   | Variable              | Required | Description                                                        |
   | ---------------------- | -------- | ------------------------------------------------------------------- |
   | `ANTHROPIC_API_KEY`    | yes      | Your Anthropic API key                                              |
   | `ANTHROPIC_MODEL`      | yes      | Model id to use (e.g. `claude-sonnet-5`) — `agent.ts` throws at import time if this is unset |
   | `ANTHROPIC_BASE_URL`   | no       | Override the Anthropic API endpoint (e.g. for a proxy); defaults to `https://api.anthropic.com` |

## Running the bot

The real entrypoint is `index.ts` — **not** `pnpm start` (that runs `coordinator.ts`, a standalone duplicate without agent wiring):

```sh
node index.ts
```

On first run, a QR code is printed to the terminal (via `qrcode-terminal`) — scan it with WhatsApp on your phone (Linked Devices) to authenticate. The session is then persisted under `session/` for subsequent runs.

Once connected, in any chat the bot is part of:

- `!ping` → replies `pong` (health check)
- `@ai list channels` → replies with the names of every chat (group and individual) the bot is currently part of, handled directly without going through the agent
- `@ai <message>` → forwards `<message>` to the LangChain/Anthropic agent and replies with its response

Every raw WhatsApp event is logged to `logs.txt` in the project root.

## Notes

- There is no working test runner configured yet; `pnpm test` is a stub.
- `client.ts`, `coordinator.ts`, and `deep-researcher.ts` are standalone/experimental scripts not wired into `index.ts` — see `CLAUDE.md` for details on the full project layout.
