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
from starlette.responses import JSONResponse
from sqlalchemy import text
from app.config import config, validate_runtime_config
from app.middleware import TrafficLimits

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
from app.services.personal_stats import PersonalStatsService
from app.ml.patch_watcher import PatchWatcher

logger = logging.getLogger("dalia.app")


async def _init_services(app: FastAPI) -> None:
    """Initialize all DALIA services in the background.

    Runs after the HTTP server is already up so the healthcheck can pass
    for liveness only. Readiness remains 503. Endpoints that depend on services check app.state.ready.
    """
    try:
        # Migrations are applied by run.py before serving traffic.
        async with engine.begin() as conn:
            revision = await conn.scalar(text("SELECT version_num FROM alembic_version"))
            if revision != "003":
                raise RuntimeError("Migrations requises : lancer alembic upgrade head")

        # ── Initialize services ──
        fetcher = LolalyticsFetcher()
        champion_db = ChampionDatabase(fetcher)
        await champion_db.initialize()

        draft_engine = DraftEngine(champion_db, fetcher)
        ban_recommender = BanRecommender(
            champion_db, fetcher, draft_engine.matchup, draft_engine.meta
        )

        patch_watcher = PatchWatcher(fetcher, check_interval=3600.0, engine=draft_engine)
        await patch_watcher.start()

        personal_stats = PersonalStatsService()

        app.state.champion_db = champion_db
        app.state.fetcher = fetcher
        app.state.draft_engine = draft_engine
        app.state.ban_recommender = ban_recommender
        app.state.patch_watcher = patch_watcher
        app.state.personal_stats = personal_stats
        app.state.ready = True
        app.state.init_error = None

        logger.info("DALIA services initialized successfully.")

    except Exception as exc:
        logger.exception("Failed to initialize DALIA services: %s", exc)
        app.state.ready = False
        app.state.init_error = "Initialisation impossible ; nouvelle tentative en cours."
    finally:
        if not getattr(app.state, "ready", False):
            if "patch_watcher" in locals(): await patch_watcher.stop()
            if "personal_stats" in locals(): await personal_stats.close()
            if "fetcher" in locals(): await fetcher.close()


async def _initialize_with_retry(app):
    delay = 2
    while not app.state.ready:
        await _init_services(app)
        if not app.state.ready:
            await asyncio.sleep(delay)
            delay = min(30, delay * 2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — server starts immediately, services init in background."""
    validate_runtime_config()
    app.state.ready = False
    app.state.init_error = None

    # Serve liveness immediately; deployment must wait for /ready.
    init_task = asyncio.create_task(_initialize_with_retry(app))

    yield
    init_task.cancel()
    await asyncio.gather(init_task, return_exceptions=True)

    # ── Shutdown ──
    try:
        if getattr(app.state, "patch_watcher", None):
            await app.state.patch_watcher.stop()
        if getattr(app.state, "fetcher", None):
            await app.state.fetcher.close()
        if getattr(app.state, "personal_stats", None):
            await app.state.personal_stats.close()
    except Exception:
        pass
    await engine.dispose()
    logger.info("DALIA Server shut down.")


app = FastAPI(
    title="DALIA Server — Draft Analysis League Intelligence Assistant",
    description="Central API server for champion recommendations, ML predictions, and user management.",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(TrafficLimits)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.allowed_origins,
    allow_credentials=False,
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


@app.get("/ready", tags=["health"])
async def readiness():
    ready = getattr(app.state, "ready", False)
    if ready:
        try:
            async with asyncio.timeout(2):
                async with engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
        except Exception:
            ready = False
    return JSONResponse({"ready": ready}, status_code=200 if ready else 503)
