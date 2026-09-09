"""Create local development configuration without overwriting existing secrets."""
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
target = root / ".env"
if target.exists():
    raise SystemExit(".env exists; keeping it unchanged. Configure server/.env from the same database credentials.")
password, jwt = secrets.token_hex(24), secrets.token_hex(32)
target.write_text(f"POSTGRES_PASSWORD={password}\nJWT_SECRET={jwt}\nRIOT_API_KEY=\n", encoding="utf-8")
server_env = root / "server/.env"
if not server_env.exists():
    server_env.write_text(f"ENV=development\nDATABASE_URL=postgresql+asyncpg://dalia:{password}@127.0.0.1:5432/dalia\nJWT_SECRET={jwt}\nRIOT_API_KEY=\n", encoding="utf-8")
print("Private local configuration created. No secrets printed. Existing PostgreSQL volumes keep their current password.")
