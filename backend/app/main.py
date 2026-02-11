"""DALIA - Main FastAPI application."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.services.champion_data import ChampionDatabase
from app.services.data_fetcher import LolalyticsFetcher
from app.services.draft_engine import DraftEngine
from app.services.lcu_connector import get_lcu_connector


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
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
