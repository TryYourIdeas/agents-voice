# Node v26 is required: no build step, .ts files run directly via Node's
# native TypeScript support (same convention as whatsap/Dockerfile).
FROM node:26-slim

# curl for the container HEALTHCHECK.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pnpm is pinned via packageManager in package.json; corepack installs the
# exact pinned version rather than whatever happens to be on the base image.
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.30.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Non-root container user — this server has file/bash tool access (see
# CLAUDE.md's Security note), so it shouldn't also run as root.
RUN groupadd --system ai-extension && useradd --system --gid ai-extension --home-dir /app ai-extension && \
    chown -R ai-extension:ai-extension /app
USER ai-extension

ENV NODE_ENV=production
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD curl -f http://localhost:4100/health || exit 1

CMD ["node", "index.ts"]
