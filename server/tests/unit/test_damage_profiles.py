"""Profils de dégâts mesurés (spec composition mesurée, 28/09/2026)."""
import importlib.util
from pathlib import Path

import pytest

from app.services.champion_data import ChampionDatabase
from app.services.mechanics import physical_share

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "refresh_damage.py"
_spec = importlib.util.spec_from_file_location("refresh_damage", _PATH)
refresh_damage = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(refresh_damage)


def _page(physical="18,969", magic="7,776", true="432"):
    """Bloc « Stats » tel que Lolalytics le rend (valeur, puis rang au poste)."""
    rows = [("Physical Damage", physical), ("Magic Damage", magic), ("True Damage", true),
            ("Total Damage", "27,179"), ("Damage Taken", "22,863")]
    cells = "".join(f'<div class="flex"><div>{label}:</div><div>{value}</div><div>19 / 64</div></div>'
                    for label, value in rows if value is not None)
    return f"<html><body><h2>Ezreal Stats</h2>{cells}<p>Ezreal vs Aatrox Build</p></body></html>"


def test_damage_by_type_is_read_from_the_rendered_stats():
    """Le texte affiché, pas l'état Qwik : lu tel quel, celui-ci donnait Ezreal à 99 % magique."""
    assert refresh_damage.parse_damage(_page()) == {"physical": 18969, "magic": 7776, "true": 432}


def test_a_missing_figure_is_refused_rather_than_read_as_zero():
    with pytest.raises(ValueError):
        refresh_damage.parse_damage(_page(true=None))


def _db(monkeypatch, raw, overrides=None, measured=None):
    class _F:
        async def fetch_all_champions_ddragon(self):
            return raw

        def champion_image_url(self, key):
            return ""

    db = ChampionDatabase(_F())
    monkeypatch.setattr(db, "_load_overrides", lambda: overrides or {})
    monkeypatch.setattr(db, "_load_damage_profiles", lambda: measured or {})
    return db


def _raw(*rows):
    return {key: {"key": str(cid), "name": key, "tags": tags, "info": {"difficulty": 5},
                  "stats": {"attackrange": 125}} for key, cid, tags in rows}


@pytest.mark.asyncio
async def test_a_measured_profile_replaces_the_one_derived_from_tags(monkeypatch):
    """Diana (Fighter/Assassin) sortait à 82 % physique ; elle inflige 85 % de magique."""
    db = _db(monkeypatch, _raw(("Diana", 131, ["Fighter", "Mage"])),
             overrides={"Diana": {"roles": ["jungle"]}},
             measured={"Diana": {"physical": 2063, "magic": 21231, "true": 1566}})
    await db.initialize()
    diana = db.get_by_key("Diana")
    assert diana.damage.magical == pytest.approx(85.4, abs=0.1)
    assert diana.damage.physical == pytest.approx(8.3, abs=0.1)
    assert diana.damage_dealt.magic == 21231 and diana.damage_dealt.measured


@pytest.mark.asyncio
async def test_an_unmeasured_champion_gets_its_role_median_split_by_its_riot_type(monkeypatch):
    """Sans mesure : dégâts médians de son poste principal, répartis selon le type Riot."""
    raw = _raw(("Syndra", 134, ["Mage"]), ("Orianna", 61, ["Mage"]), ("Ahri", 103, ["Mage"]),
               ("Nouvelle", 999, ["Mage"]))
    overrides = {k: {"roles": ["mid"]} for k in raw}
    overrides["Nouvelle"]["damage_type"] = "magic"
    measured = {"Syndra": {"physical": 0, "magic": 24000, "true": 0},
                "Orianna": {"physical": 0, "magic": 20000, "true": 0},
                "Ahri": {"physical": 0, "magic": 16000, "true": 2000}}
    db = _db(monkeypatch, raw, overrides, measured)
    await db.initialize()
    nouvelle = db.get_by_key("Nouvelle")
    assert not nouvelle.damage_dealt.measured
    assert nouvelle.damage_dealt.total == pytest.approx(20000)
    assert nouvelle.damage_dealt.magic == pytest.approx(18000), "type magique : 90 % magique"
    assert nouvelle.damage.magical == pytest.approx(90.0)


@pytest.mark.asyncio
async def test_without_measure_nor_riot_type_the_tag_profile_is_kept(monkeypatch):
    raw = _raw(("Jinx", 222, ["Marksman"]), ("Inconnue", 998, ["Marksman"]))
    overrides = {"Jinx": {"roles": ["bot"]}, "Inconnue": {"roles": ["bot"]}}
    db = _db(monkeypatch, raw, overrides, {"Jinx": {"physical": 23000, "magic": 700, "true": 300}})
    await db.initialize()
    inconnue = db.get_by_key("Inconnue")
    assert (inconnue.damage.physical, inconnue.damage.magical) == (82, 13), "profil Marksman des tags"
    assert inconnue.damage_dealt.physical == pytest.approx(24000 * 0.82)


def test_the_physical_share_reads_the_measure_before_the_riot_type():
    """Kai'Sa : type Riot « mixte » (50 %), mesurée à 58 % physique."""
    from app.models.champion import Champion, DamageDealt
    kaisa = Champion(id=145, key="Kaisa", name="Kai'Sa", damage_type="mixed",
                     damage_dealt=DamageDealt(physical=14263, magic=10013, true=378, measured=True))
    assert physical_share(kaisa) == pytest.approx(14263 / (14263 + 10013), abs=0.001)


def test_the_committed_profiles_cover_every_champion_with_real_figures():
    import json
    data = Path(__file__).resolve().parents[2] / "app" / "data"
    profiles = json.loads((data / "damage_profiles.json").read_text(encoding="utf-8"))
    overrides = json.loads((data / "champion_overrides.json").read_text(encoding="utf-8"))
    champions = {k for k, v in overrides.items() if isinstance(v, dict)}
    failed = {f.split(" ")[0] for f in profiles["_meta"]["failed"]}
    assert champions - failed <= set(profiles)
    for key, v in profiles.items():
        if key != "_meta":
            assert set(v) == {"physical", "magic", "true"} and sum(v.values()) > 3000, key
