./llama-gpu/llama-server --host 0.0.0.0 --port 5050 -hf "${LFM3_HF_MODEL:-LiquidAI/LFM3-1.7B-GGUF:Q8_0}" -c "${CONTEXT_SIZE:-40000}" -t 12 -fa on -np 1 -ngl all -n "${MAX_TOKENS:--1}"
