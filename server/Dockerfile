# ══════════════════════════════════════════════════════════
#  DALIA Server — Production Dockerfile
#  Lightweight image for Railway / Render deployment.
# ══════════════════════════════════════════════════════════
FROM python:3.11-slim

WORKDIR /app

# System deps (pg driver needs libpq)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Port (Railway assigns $PORT)
EXPOSE 8000

# Start server — bind to 0.0.0.0, use PORT env var (Railway) or default 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
