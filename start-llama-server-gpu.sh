./llama-gpu/llama-server --host 0.0.0.0 --port 5050 --model model-qwen3.5/Qwen3.5-4B-UD-Q4_K_XL.gguf -c "${CONTEXT_SIZE:-40000}" -t 12 -fa on -np 1 -ngl all -n "${MAX_TOKENS:--1}"
