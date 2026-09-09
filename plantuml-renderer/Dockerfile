# Multi-stage build: stage 1 compiles TypeScript, stage 2 is the actual
# runtime image — no TypeScript source, dev dependencies, or build tools
# ship in the final image.

FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS production

# Pinned PlantUML release — never "latest". Override at build time with
# --build-arg PLANTUML_VERSION=x.y.z to upgrade deliberately.
ARG PLANTUML_VERSION=1.2024.7

# default-jre-headless: the JVM PlantUML runs on (headless — no display
#   server needed, matches -Djava.awt.headless=true passed at invocation).
# graphviz: PlantUML's `dot` layout engine, needed for some diagram types
#   (component, some class-diagram layouts) even though the primary
#   sequence-diagram case uses PlantUML's own pure-Java layout.
# curl: only used to fetch the pinned jar below and for the HEALTHCHECK.
RUN apt-get update && apt-get install -y --no-install-recommends \
        default-jre-headless \
        graphviz \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/plantuml && \
    curl -fsSL -o /opt/plantuml/plantuml.jar \
        "https://github.com/plantuml/plantuml/releases/download/v${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

# Non-root container user — see README's Security section.
RUN groupadd --system plantuml && useradd --system --gid plantuml --home-dir /app plantuml && \
    chown -R plantuml:plantuml /app /opt/plantuml
USER plantuml

ENV NODE_ENV=production \
    PORT=3000 \
    PLANTUML_JAR=/opt/plantuml/plantuml.jar

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
