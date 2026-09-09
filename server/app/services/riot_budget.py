"""Conservative Riot quota shared by local API workers and match collectors.

SQLite transactions synchronize processes on the same host/volume. Only a hash
of the API key is stored. Separate deployments need a shared gateway/limiter.
"""
import asyncio
import hashlib
from pathlib import Path
import sqlite3
import time
from app.config import config


class RiotBudget:
    def __init__(self, path=None):
        self.path = Path(path or (Path(config.cache_dir) / "riot-budget.sqlite"))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.path) as db:
            db.execute("CREATE TABLE IF NOT EXISTS requests (key TEXT, at REAL)")
            db.execute("CREATE INDEX IF NOT EXISTS request_key_time ON requests(key,at)")
            db.execute("CREATE TABLE IF NOT EXISTS cooldowns (key TEXT PRIMARY KEY, until REAL)")

    @staticmethod
    def key(api_key): return hashlib.sha256(api_key.encode()).hexdigest()

    def reserve(self, api_key, now=None):
        now = time.time() if now is None else now
        key = self.key(api_key)
        with sqlite3.connect(self.path, timeout=5) as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM requests WHERE at <= ?", (now - 121,))
            db.execute("DELETE FROM cooldowns WHERE until <= ?", (now,))
            timestamps = [row[0] for row in db.execute("SELECT at FROM requests WHERE key=? ORDER BY at", (key,))]
            cooldown = db.execute("SELECT until FROM cooldowns WHERE key=?", (key,)).fetchone()
            wait = max(0., (cooldown[0] if cooldown else now) - now)
            if len(timestamps) >= 20: wait = max(wait, timestamps[-20] + 1.05 - now)
            if len(timestamps) >= 100: wait = max(wait, timestamps[-100] + 121 - now)
            if wait <= 0: db.execute("INSERT INTO requests VALUES (?,?)", (key, now))
            return max(0., wait)

    def wait(self, api_key):
        while (delay := self.reserve(api_key)) > 0: time.sleep(delay)

    async def acquire(self, api_key):
        while (delay := await asyncio.to_thread(self.reserve, api_key)) > 0: await asyncio.sleep(delay)

    def penalize(self, api_key, seconds):
        try: seconds = max(1, min(3600, float(seconds)))
        except (TypeError, ValueError): seconds = 10
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO cooldowns VALUES (?,?) ON CONFLICT(key) DO UPDATE SET until=MAX(until,excluded.until)",
                       (self.key(api_key), time.time() + seconds))
