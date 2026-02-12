"""DALIA - Main FastAPI application."""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

from app.api.routes import router
from app.services.champion_data import ChampionDatabase
from app.services.data_fetcher import LolalyticsFetcher
from app.services.draft_engine import DraftEngine
from app.services.lcu_connector import get_lcu_connector

logger = logging.getLogger("dalia.app")

# ── Resolve frontend dist directory ────────────────────────────────────
if getattr(sys, "frozen", False):
    # Running inside a PyInstaller bundle
    _FRONTEND_DIR = Path(sys._MEIPASS) / "frontend_dist"
else:
    # Running from source
    _FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


class _SPAStaticFiles(StaticFiles):
    """StaticFiles subclass that falls back to index.html for SPA routing."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return FileResponse(str(Path(self.directory) / "index.html"))
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize services on startup, cleanup on shutdown."""
    # --- Startup ---
    fetcher = LolalyticsFetcher()
    champion_db = ChampionDatabase(fetcher)
    await champion_db.initialize()

    draft_engine = DraftEngine(champion_db, fetcher)
    
    # Initialize LCU connector and start polling
    lcu_connector = get_lcu_connector()
    await lcu_connector.start_polling(interval=1.0)

    app.state.champion_db = champion_db
    app.state.fetcher = fetcher
    app.state.draft_engine = draft_engine
    app.state.lcu_connector = lcu_connector

    yield

    # --- Shutdown ---
    await lcu_connector.stop_polling()
    await lcu_connector.disconnect()
    await fetcher.close()


app = FastAPI(
    title="DALIA - Draft Analysis League Intelligence Assistant",
    description="Optimal champion pick recommender for League of Legends ranked drafts.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routes (registered BEFORE the SPA mount so they take priority) ─
app.include_router(router, prefix="/api")

# ── Serve built frontend (production / packaged mode) ──────────────────
if _FRONTEND_DIR.exists() and (_FRONTEND_DIR / "index.html").exists():
    logger.info(f"Serving frontend from {_FRONTEND_DIR}")
    app.mount("/", _SPAStaticFiles(directory=str(_FRONTEND_DIR), html=True), name="frontend")
