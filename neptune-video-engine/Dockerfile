FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ffmpeg \
      curl \
      libglib2.0-0 \
      libgl1 \
      libgomp1 \
      libsm6 \
      libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt
COPY app.py runtime.py ./

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 4318

HEALTHCHECK --interval=20s --timeout=5s --start-period=60s --retries=6 \
  CMD curl -fsS -H "X-Neptune-Engine-Token: ${NEPTUNE_ENGINE_TOKEN}" http://127.0.0.1:4318/health || exit 1

CMD ["uvicorn", "runtime:app", "--host", "0.0.0.0", "--port", "4318", "--workers", "1"]
