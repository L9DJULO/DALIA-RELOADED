"""Le gel du cache de calibration : snapshot, manifeste, et choix du mode.

Sans gel, l'effet d'une vague de scoring est indiscernable de la dérive des données
Lolalytics — les compteurs de triage ont bougé seuls entre le 14 et le 15/09/2026.
"""
import importlib.util
import json
import sys
from pathlib import Path

from app.services.data_fetcher import FileCache
from app.services.storage import cache_key

# frozen_cache.py vit à côté de run_calibration.py, hors package : chargement par chemin.
_PATH = Path(__file__).resolve().parents[1] / "calibration" / "frozen_cache.py"
_spec = importlib.util.spec_from_file_location("frozen_cache", _PATH)
frozen_cache = importlib.util.module_from_spec(_spec)
sys.modules["frozen_cache"] = frozen_cache  # @dataclass résout ses annotations via sys.modules
_spec.loader.exec_module(frozen_cache)

_RUN = Path(__file__).resolve().parents[1] / "calibration" / "run_calibration.py"
_run_spec = importlib.util.spec_from_file_location("run_calibration", _RUN)
run_calibration = importlib.util.module_from_spec(_run_spec)
_run_spec.loader.exec_module(run_calibration)


def test_freeze_snapshots_the_live_cache_with_a_manifest(tmp_path):
    """Le snapshot est une copie : le cache vivant est réécrit dès qu'on lance l'app."""
    live, frozen = tmp_path / "cache", tmp_path / "frozen"
    live.mkdir()
    FileCache(str(live)).set("lola_list_middle", {"cid": {}})

    manifest = frozen_cache.freeze(live, frozen, ddragon_version="16.17.1", tier="master_plus")

    assert (frozen / f"{cache_key('lola_list_middle')}.json").exists()
    assert manifest["entries"] == 1 and manifest["tier"] == "master_plus"
    on_disk = json.loads((frozen / "MANIFEST.json").read_text(encoding="utf-8"))
    assert on_disk["ddragon_version"] == "16.17.1" and on_disk["frozen_at"] > 0


def test_calibration_prefers_the_frozen_snapshot_when_it_exists(tmp_path):
    """Il faut demander pour sortir du gel, jamais pour y entrer."""
    frozen = tmp_path / "frozen"
    assert frozen_cache.resolve(frozen).offline is False

    frozen.mkdir()
    (frozen / "MANIFEST.json").write_text(json.dumps({"frozen_at": 1, "entries": 3}), encoding="utf-8")

    mode = frozen_cache.resolve(frozen)
    assert mode.offline and mode.cache_dir == str(frozen) and mode.cache_ttl_hours is None
    assert frozen_cache.resolve(frozen, live=True).offline is False


async def test_the_calibration_run_actually_builds_a_frozen_fetcher(tmp_path):
    """Un gel non branché ne sert à rien : le fetcher du run doit lire le snapshot, hors ligne."""
    frozen = tmp_path / "frozen"
    frozen_cache.freeze(tmp_path / "live", frozen, tier="master_plus")

    fetcher, mode = run_calibration.build_fetcher(frozen)

    assert fetcher.offline and fetcher._cache.dir == frozen and fetcher._cache.ttl is None
    assert "GELÉ" in mode.banner()
    await fetcher.close()


def test_the_run_never_builds_its_fetcher_behind_the_cache_mode():
    """Le gel doit être branché dans `main`, pas seulement disponible à côté.

    Régression vécue : `build_fetcher` existait et passait ses tests pendant que `main`
    appelait encore `LolalyticsFetcher()` en direct — la mesure tournait sur le cache vivant
    sans que rien ne le signale.
    """
    import inspect
    source = inspect.getsource(run_calibration.main)
    assert "build_fetcher(" in source
    assert "LolalyticsFetcher()" not in source
