import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI
from app import main


@pytest.mark.asyncio
async def test_startup_retries_a_transient_failure(monkeypatch):
    app = FastAPI(); app.state.ready = False
    attempts = []
    async def initialize(application):
        attempts.append(1)
        application.state.ready = len(attempts) == 2
    monkeypatch.setattr(main, '_init_services', initialize)
    monkeypatch.setattr(main.asyncio, 'sleep', AsyncMock())
    await main._initialize_with_retry(app)
    assert len(attempts) == 2 and app.state.ready


@pytest.mark.asyncio
async def test_cancelled_initialization_closes_network_client(monkeypatch):
    class Connection:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def scalar(self, *args): return main.expected_schema_revision()
    fetcher = SimpleNamespace(close=AsyncMock())
    monkeypatch.setattr(main, 'engine', SimpleNamespace(begin=lambda: Connection()))
    monkeypatch.setattr(main, 'LolalyticsFetcher', lambda: fetcher)
    monkeypatch.setattr(main.ChampionDatabase, 'initialize', AsyncMock(side_effect=asyncio.CancelledError))
    app = FastAPI(); app.state.ready = False
    with pytest.raises(asyncio.CancelledError): await main._init_services(app)
    fetcher.close.assert_awaited_once()
