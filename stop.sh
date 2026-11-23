#!/usr/bin/env bash
# Stops the whatsap stack, then any leftover llama-server containers
# (e.g. started from another compose file / project).
cd "$(dirname "$0")" || exit 1

docker compose -f whatsap-lfm3-stt-tts-vision-kokoro-docker-compose.yml down --remove-orphans

# llama-server images: llama-server-lfm3-gpu, llama-server-lfm3-vl-gpu, ...
leftover=$(docker ps -q --filter "ancestor=llama-server-lfm3-gpu:latest" --filter "ancestor=llama-server-lfm3-vl-gpu:latest"; docker ps -q --filter "name=llama-server")
if [ -n "$leftover" ]; then
  echo "Stopping leftover llama containers:"
  echo "$leftover" | sort -u | xargs docker stop
fi
