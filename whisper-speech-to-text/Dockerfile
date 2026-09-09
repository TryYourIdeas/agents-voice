FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models \
    HF_HUB_ENABLE_HF_TRANSFER=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        libsndfile1 \
        ffmpeg \
        ca-certificates \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install torch with CUDA 12.4 wheels (GPU). Override TORCH_INDEX_URL at build
# time to https://download.pytorch.org/whl/cpu for a CPU-only image.
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cu124
RUN pip install --no-cache-dir \
        torch==2.5.1 torchaudio==2.5.1 \
        --index-url ${TORCH_INDEX_URL}

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Faster model downloads from the Hub.
RUN pip install --no-cache-dir hf_transfer

COPY app.py .

EXPOSE 8001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
