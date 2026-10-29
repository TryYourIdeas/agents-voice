# LFM3-Audio-2B, Q4_K_M GGUF, run through llama.cpp (llama-mtmd-cli for ASR,
# llama-tts for TTS) instead of bf16 transformers: ~1.1GB weights vs ~3.5GB+.
# llama.cpp >= b11960 is required for LFM3 — the repo's prebuilt llama-gpu/
# (build 10791) is too old, so it is built from source here.
FROM nvidia/cuda:12.6.3-devel-ubuntu24.04 AS build
ARG LLAMA_CPP_TAG=b11960
# Space-separated CUDA archs to compile (default: Turing..Ada; 86 = RTX 3060).
ARG CUDA_ARCHS="75;80;86;89"
RUN apt-get update && apt-get install -y --no-install-recommends \
        git cmake build-essential ca-certificates libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${LLAMA_CPP_TAG} https://github.com/ggml-org/llama.cpp /src
WORKDIR /src
# libcuda.so.1 is only injected at run time; link against the toolkit stub.
RUN cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES="${CUDA_ARCHS}" \
        -DCMAKE_EXE_LINKER_FLAGS=-Wl,--allow-shlib-undefined \
        -DLLAMA_CURL=ON -DBUILD_SHARED_LIBS=ON \
    && cmake --build build -j --target llama-mtmd-cli llama-tts

FROM nvidia/cuda:12.6.3-runtime-ubuntu24.04
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/models HF_HUB_ENABLE_HF_TRANSFER=0
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv ffmpeg libgomp1 libcurl4 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/build/bin/ /opt/llama/
ENV LD_LIBRARY_PATH=/opt/llama PATH=/opt/llama:$PATH
RUN python3 -m venv /venv
ENV PATH=/venv/bin:$PATH
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
EXPOSE 8010
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8010"]
