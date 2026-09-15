import os
import sys
from pathlib import Path
os.environ["ENV"] = "test"
os.environ["JWT_SECRET"] = "unit-test-secret-only-" + "x" * 48
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from app.models.champion import Champion, ChampionRatings, DamageProfile
from app.services.champion_data import ChampionDatabase


class FakeFetcher:
    TIER, REGION, QUEUE = "master_plus", "all", "ranked"
    last_errors = {}
    async def get_current_patch(self): return "16.17"
    async def fetch_counter_page(self, *args, **kwargs): return {}
    async def fetch_tierlist(self, *args, **kwargs): return {}


@pytest.fixture
def catalog():
    db = ChampionDatabase(FakeFetcher())
    rows = [(78, "Poppy", ["top", "jungle", "support"]), (75, "Nasus", ["top"]),
            (103, "Ahri", ["mid"]), (61, "Orianna", ["mid"]), (222, "Jinx", ["bot"]),
            (81, "Ezreal", ["bot"]), (59, "JarvanIV", ["jungle"]), (254, "Vi", ["jungle"]),
            (54, "Malphite", ["top"]), (40, "Janna", ["support"]), (24, "Jax", ["top"]),
            (895, "Nilah", ["bot"]), (69, "Cassiopeia", ["mid", "top"]), (157, "Yasuo", ["mid"]),
            (25, "Morgana", ["support"]), (67, "Vayne", ["bot", "top"]), (22, "Ashe", ["bot"])]
    # Portées réelles de Data Dragon : la fixture doit classer mêlée/distance comme le vrai catalogue.
    ranges = {"Poppy": 125, "Nasus": 125, "Ahri": 550, "Orianna": 525, "Jinx": 525, "Ezreal": 550,
              "JarvanIV": 175, "Vi": 125, "Malphite": 125, "Janna": 550, "Jax": 125, "Nilah": 225,
              "Cassiopeia": 550, "Yasuo": 175, "Morgana": 450, "Vayne": 550, "Ashe": 600}
    for cid, key, roles in rows:
        tank = key in {"Poppy", "Malphite", "JarvanIV"}
        champion = Champion(id=cid, key=key, name=key, roles=roles, tags=["Tank"] if tank else ["Mage"],
            ratings=ChampionRatings(tankiness=5 if tank else 2, cc=4 if tank else 3, engage=4 if tank else 2),
            attack_range=ranges[key],
            damage=DamageProfile(physical=10 if "mid" in roles else 80, magical=85 if "mid" in roles else 15))
        db._by_id[cid] = champion; db._by_key[key] = champion
    return db
