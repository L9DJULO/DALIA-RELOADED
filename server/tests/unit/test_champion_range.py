"""La portee d'attaque vient de Data Dragon, pas d'une approximation."""
import pytest
from app.models.champion import Champion
from app.services.champion_data import ChampionDatabase


def _champ(**kw):
    base = dict(id=1, key="X", name="X")
    base.update(kw)
    return Champion(**base)


def test_melee_and_ranged_are_split_on_attack_range():
    assert _champ(attack_range=175).is_melee, "Yasuo"
    assert _champ(attack_range=225).is_melee, "Nilah"
    assert not _champ(attack_range=450).is_melee, "Thresh"
    assert not _champ(attack_range=500).is_melee, "Samira est a distance malgre son kit de contact"
    assert not _champ(attack_range=650).is_melee, "Caitlyn"


def test_catalog_classifies_melee_and_ranged(catalog):
    by_name = {c.name: c for c in catalog.all_champions()}
    for name in ("Nilah", "Yasuo", "Jax", "Malphite", "Poppy", "Nasus", "Vi", "JarvanIV"):
        assert by_name[name].is_melee, f"{name} est au corps a corps"
    for name in ("Ashe", "Ezreal", "Jinx", "Vayne", "Janna", "Morgana", "Ahri"):
        assert not by_name[name].is_melee, f"{name} est a distance"


def test_ranged_carries_are_no_longer_flagged_as_melee(catalog):
    """L'ancien heuristique (tankiness <= 2 et degats physiques >= 60) classait
    Ashe, Vayne et Jinx en carry melee : elles cochaient les deux conditions."""
    by_name = {c.name: c for c in catalog.all_champions()}
    for name in ("Ashe", "Jinx", "Vayne"):
        c = by_name[name]
        assert c.ratings.tankiness <= 2 and c.damage.physical >= 60, "conditions de l'ancien heuristique"
        assert not c.is_melee, f"{name} ne doit plus etre traitee comme un carry melee"


@pytest.mark.asyncio
async def test_loader_reads_attackrange_from_data_dragon(monkeypatch):
    """Le champ existe dans champion.json et doit etre repris tel quel."""
    raw = {"Caitlyn": {"key": "51", "name": "Caitlyn", "tags": ["Marksman"],
                       "info": {"difficulty": 6}, "stats": {"attackrange": 650}},
           "Leona": {"key": "89", "name": "Leona", "tags": ["Tank", "Support"],
                     "info": {"difficulty": 4}, "stats": {"attackrange": 125}},
           "Sansstats": {"key": "999", "name": "Sansstats", "tags": ["Mage"],
                         "info": {"difficulty": 5}}}

    class _F:
        async def fetch_all_champions_ddragon(self):
            return raw

        async def get_ddragon_version(self):
            return "16.3.1"

        def champion_image_url(self, key):
            return ""

    db = ChampionDatabase(_F())
    await db.initialize()
    by_name = {c.name: c for c in db.all_champions()}
    assert by_name["Caitlyn"].attack_range == 650 and not by_name["Caitlyn"].is_melee
    assert by_name["Leona"].attack_range == 125 and by_name["Leona"].is_melee
    assert by_name["Sansstats"].attack_range == 550, "repli quand stats est absent"


@pytest.mark.asyncio
async def test_loader_warns_on_override_keys_matching_no_champion(monkeypatch, caplog):
    """« Wukong » a perdu ses rôles en silence : Data Dragon l'appelle « MonkeyKing »."""
    raw = {"MonkeyKing": {"key": "62", "name": "Wukong", "tags": ["Fighter", "Tank"],
                          "info": {"difficulty": 3}, "stats": {"attackrange": 175}}}

    class _F:
        async def fetch_all_champions_ddragon(self):
            return raw

        def champion_image_url(self, key):
            return ""

    db = ChampionDatabase(_F())
    monkeypatch.setattr(db, "_load_overrides", lambda: {"_comment": "", "Wukong": {"roles": ["jungle"]}})
    with caplog.at_level("WARNING", logger="dalia.champion_data"):
        await db.initialize()
    assert "wukong" in caplog.text
    assert db.get_by_key("MonkeyKing").roles == ["top"], "l'entrée orpheline n'est pas lue : repli sur les tags"
