"""DALIA Server — Main FastAPI application.

This is the central API server. It does NOT serve a frontend.
The Tauri client connects to this server via HTTP.
LCU connector has been moved to the Tauri client.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as main_router
from app.api.auth_routes import router as auth_router
from app.api.user_routes import router as user_router
from app.api.history_routes import router as history_router
from app.api.duo_routes import router as duo_router
from app.db.models import Base
from app.db.session import engine
from app.services.champion_data import ChampionDatabase
from app.services.data_fetcher import LolalyticsFetcher
from app.services.draft_engine import DraftEngine
from app.services.ban_recommender import BanRecommender
from app.ml.patch_watcher import PatchWatcher

logger = logging.getLogger("dalia.app")


async def _init_services(app: FastAPI) -> None:
    """Initialize all DALIA services in the background.

    Runs after the HTTP server is already up so the healthcheck can pass
    immediately. Endpoints that depend on services check app.state.ready.
    """
    try:
        # ── Create database tables ──
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables ensured.")

        # ── Initialize services ──
        fetcher = LolalyticsFetcher()
        champion_db = ChampionDatabase(fetcher)
        await champion_db.initialize()

        draft_engine = DraftEngine(champion_db, fetcher)
        ban_recommender = BanRecommender(
            champion_db, fetcher, draft_engine.matchup, draft_engine.meta
        )

        patch_watcher = PatchWatcher(fetcher, check_interval=3600.0)
        await patch_watcher.start()

        app.state.champion_db = champion_db
        app.state.fetcher = fetcher
        app.state.draft_engine = draft_engine
        app.state.ban_recommender = ban_recommender
        app.state.patch_watcher = patch_watcher
        app.state.ready = True

        logger.info("DALIA services initialized successfully.")

    except Exception as exc:
        logger.exception("Failed to initialize DALIA services: %s", exc)
        app.state.ready = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — server starts immediately, services init in background."""
    app.state.ready = False

    # Start immediately so Railway healthcheck passes, init services in background
    asyncio.create_task(_init_services(app))

    yield

    # ── Shutdown ──
    try:
        if getattr(app.state, "patch_watcher", None):
            await app.state.patch_watcher.stop()
        if getattr(app.state, "fetcher", None):
            await app.state.fetcher.close()
    except Exception:
        pass
    await engine.dispose()
    logger.info("DALIA Server shut down.")


app = FastAPI(
    title="DALIA Server — Draft Analysis League Intelligence Assistant",
    description="Central API server for champion recommendations, ML predictions, and user management.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your Tauri/web client origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ──
app.include_router(auth_router, prefix="/api")
app.include_router(user_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(duo_router, prefix="/api")
app.include_router(main_router, prefix="/api")


@app.get("/health", tags=["health"])
async def health():
    """Healthcheck — always responds 200, reports service readiness."""
    return {"status": "ok", "ready": getattr(app.state, "ready", False)}
