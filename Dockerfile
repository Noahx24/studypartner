FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install runtime deps first so layer cache holds across code edits.
COPY app/pyproject.toml ./app/pyproject.toml
RUN pip install -e "./app/.[pdf,ai]"

# App code last. The non-root user owns /app so the writable bits
# (data/, uploads/) work without chown gymnastics.
RUN useradd --create-home --uid 1000 studypartner
COPY app ./app
COPY README.md ./README.md

RUN mkdir -p /app/data /app/data/uploads \
 && chown -R studypartner:studypartner /app

USER studypartner

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# Default to a single worker; orchestrator scales horizontally.
# Override via UVICORN_WORKERS for multi-process boxes.
ENV UVICORN_WORKERS=1
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS}"]
