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


def test_extend_adds_only_missing_entries_and_dates_it(tmp_path):
    """Étendre le gel ne réécrit jamais une entrée : l'ancien moteur rejoue son baseline."""
    live, frozen = tmp_path / "cache", tmp_path / "frozen"
    live.mkdir()
    FileCache(str(live)).set("lola_list_middle", {"cid": {"1": "old"}})
    frozen_cache.freeze(live, frozen, ddragon_version="16.19.1", tier="master_plus")
    FileCache(str(live)).set("lola_list_middle", {"cid": {"1": "fresh"}})
    FileCache(str(live)).set("lola_team_xayah_bottom", {"team": {}})

    manifest = frozen_cache.extend(live, frozen)

    kept = json.loads((frozen / f"{cache_key('lola_list_middle')}.json").read_text(encoding="utf-8"))
    assert kept["cid"]["1"] == "old"
    assert (frozen / f"{cache_key('lola_team_xayah_bottom')}.json").exists()
    assert manifest["entries"] == 2 and manifest["added"] == 1
    assert manifest["extended"][-1]["added"] == 1 and manifest["tier"] == "master_plus"
    on_disk = json.loads((frozen / "MANIFEST.json").read_text(encoding="utf-8"))
    assert on_disk["entries"] == 2


def test_extend_refuses_a_missing_snapshot(tmp_path):
    (tmp_path / "cache").mkdir()
    import pytest
    with pytest.raises(FileNotFoundError):
        frozen_cache.extend(tmp_path / "cache", tmp_path / "frozen")


def _frozen_with(tmp_path, *keys):
    live, frozen = tmp_path / "cache", tmp_path / "frozen"
    live.mkdir()
    for k in keys:
        FileCache(str(live)).set(k, {"k": k})
    frozen_cache.freeze(live, frozen, tier="master_plus")
    return frozen


def test_prune_keeps_only_the_entries_the_suite_reads_and_dates_it(tmp_path):
    """Chantier 9 : on versionne les seules entrées lues (684 sur 2 710 le 28/09)."""
    frozen = _frozen_with(tmp_path, "lola_list_middle", "lola_counter_zed_middle", "lola_list_top")
    read = {f"{cache_key('lola_list_middle')}.json", f"{cache_key('lola_list_top')}.json"}

    manifest = frozen_cache.prune(frozen, read)

    assert {p.name for p in frozen.glob("*.json")} == read | {"MANIFEST.json"}
    assert manifest["entries"] == 2 and manifest["pruned"][-1]["removed"] == 1
    assert json.loads((frozen / "MANIFEST.json").read_text(encoding="utf-8"))["entries"] == 2


def test_prune_refuses_an_empty_read_set_and_a_missing_snapshot(tmp_path):
    """Un enregistrement vide viderait le gel : c'est une panne, pas un résultat."""
    import pytest
    frozen = _frozen_with(tmp_path, "lola_list_middle")
    with pytest.raises(ValueError):
        frozen_cache.prune(frozen, set())
    assert (frozen / f"{cache_key('lola_list_middle')}.json").exists()
    with pytest.raises(FileNotFoundError):
        frozen_cache.prune(tmp_path / "absent", {"x.json"})


async def test_reads_through_the_run_fetcher_are_recorded(tmp_path):
    frozen = _frozen_with(tmp_path, "lola_list_middle", "lola_list_top")
    fetcher, _ = run_calibration.build_fetcher(frozen)
    read = run_calibration.record_reads(fetcher)

    assert fetcher._cache.get("lola_list_middle") == {"k": "lola_list_middle"}, "la lecture passe toujours"
    assert read == {f"{cache_key('lola_list_middle')}.json"}
    await fetcher.close()
