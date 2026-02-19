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

# Install PyTorch CPU-only first (avoids downloading the 2GB CUDA build)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Port (Railway assigns $PORT)
EXPOSE 8000

CMD ["python", "run.py"]
