#!/bin/sh
# Rebuild ./llama-gpu from source (default tag b11960, the minimum for LFM3).
# Usage: scripts/build-llama-gpu.sh [tag] [cuda-archs]   e.g. b11960 "86;89"
set -e
cd "$(dirname "$0")/.."
TAG="${1:-b11960}"; ARCHS="${2:-86}"
[ -d llama-gpu ] && mv llama-gpu "llama-gpu.old.$(date +%s)" || true
DOCKER_BUILDKIT=1 docker build -f llama-server/Dockerfile.build-llama-gpu \
  --build-arg LLAMA_CPP_TAG="$TAG" --build-arg CUDA_ARCHS="$ARCHS" \
  --target export --output type=local,dest=llama-gpu .
