# Build context is the repo root (see docker-compose-whatsap.yml's
# `context: .`) so this Dockerfile can also copy in lib/langchain-agent-kit,
# a sibling package this project's package.json depends on via `file:`.
#
# Node v26 is required: this repo has no build step and runs .ts files
# directly via Node's native TypeScript support (see CLAUDE.md / README.md).
FROM node:26-slim

# System Chromium for whatsapp-web.js/puppeteer, instead of letting puppeteer
# download its own bundled copy during install (slower, and pulls libs this
# slim base doesn't have). PUPPETEER_SKIP_DOWNLOAD + PUPPETEER_EXECUTABLE_PATH
# point puppeteer at it; client.ts passes --no-sandbox since Chromium has no
# usable sandbox running as root in a container.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        ca-certificates \
        dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

# pnpm is pinned via packageManager in package.json; corepack installs the
# exact pinned version rather than whatever pnpm image tag happened to exist.
# Corepack is no longer bundled with Node by default (removed in recent
# releases), so install it explicitly before enabling it.
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.30.0 --activate

WORKDIR /app

# Build context is now the repo root (see docker-compose-whatsap.yml), so
# langchain-agent-kit is copied to /lib — this package's own
# "file:../lib/langchain-agent-kit" dependency then resolves against it
# exactly like it does on disk, where whatsap/ and lib/ are sibling
# directories under the repo root.
COPY lib/langchain-agent-kit /lib/langchain-agent-kit
COPY whatsap/package.json whatsap/pnpm-lock.yaml whatsap/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY whatsap/ .
RUN chmod +x docker-entrypoint.sh

# session/ (WhatsApp LocalAuth credentials) and logs*.txt are meant to
# persist across restarts — mount them as volumes in compose, not baked here.

ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
# Real entrypoint is index.ts, not `pnpm start` (that runs coordinator.ts,
# a standalone duplicate with no agent wiring) — see CLAUDE.md.
CMD ["node", "index.ts"]
