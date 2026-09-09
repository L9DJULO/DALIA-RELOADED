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
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=reload, proxy_headers=False)
