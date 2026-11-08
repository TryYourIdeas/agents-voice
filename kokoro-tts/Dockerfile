# Kokoro-82M v1.0 (hexgrad/Kokoro-82M) behind the same /tts contract as
# lfm3-audio, so whatsap only needs TTS_URL pointed here.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models

# espeak-ng: Kokoro's fallback G2P for non-English languages and OOV words.
RUN apt-get update && apt-get install -y --no-install-recommends \
        espeak-ng libsndfile1 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CUDA 12.4 wheels by default; for a CPU-only image build with
# --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cu124
RUN pip install --no-cache-dir torch==2.6.0 --index-url ${TORCH_INDEX_URL}

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8020
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8020"]
