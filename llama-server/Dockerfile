# Build context is the repo root (see docker-compose.yml's `context: .`)
# because llama/, model-qwen3.5/, and start-llama-server.sh live there.
# trixie-slim (Debian 13) is required, not bookworm: the llama-server binary
# was built against GLIBC 2.38 / OPENSSL 3.3, which bookworm's glibc predates.
FROM debian:trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libssl3 \
        libgomp1 \
        zlib1g \
        libzstd1 \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY llama/ ./llama/
COPY model-qwen3.5/ ./model-qwen3.5/
COPY start-llama-server.sh .

RUN chmod +x start-llama-server.sh llama/llama-server

EXPOSE 5050

# start-llama-server.sh has no shebang line, so it must be run through a shell
# rather than exec'd directly (exec form would hit "exec format error").
CMD ["sh", "start-llama-server.sh"]
