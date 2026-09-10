"""DALIA Server — Entry point (dev + production)."""
import os
import uvicorn
import subprocess
import sys
from pathlib import Path
from app.config import validate_runtime_config

if __name__ == "__main__":
    validate_runtime_config()
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=Path(__file__).parent, check=True)
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("ENV", "production") == "development"
    # Behind a reverse proxy every request arrives from the proxy address, which
    # would make the per-client rate limits global. Trust X-Forwarded-For only
    # from the proxies listed in FORWARDED_ALLOW_IPS ("*" on Railway, where the
    # app is not reachable directly). Railway sets RAILWAY_ENVIRONMENT itself.
    forwarded = os.getenv("FORWARDED_ALLOW_IPS") or ("*" if os.getenv("RAILWAY_ENVIRONMENT") else "")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=reload,
                proxy_headers=bool(forwarded), forwarded_allow_ips=forwarded or None)
