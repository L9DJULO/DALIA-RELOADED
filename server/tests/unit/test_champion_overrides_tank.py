"""La propriété `tank` suit la définition du joueur (28/09) : Vanguard, Warden, Juggernaut."""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "app" / "data"
TANK_SUBCLASSES = {"Vanguard", "Warden", "Juggernaut"}
# Écarts nommés par le joueur à la règle des sous-classes (aucun à ce jour).
ADDED, REMOVED = set(), set()


def test_tank_property_matches_the_wiki_subclasses():
    facts = json.loads((DATA / "champion_facts.json").read_text(encoding="utf-8"))
    overrides = json.loads((DATA / "champion_overrides.json").read_text(encoding="utf-8"))
    by_subclass = {k for k, v in facts.items()
                   if k != "_meta" and TANK_SUBCLASSES & set(v.get("subclasses") or [])}
    tagged = {k for k, v in overrides.items() if isinstance(v, dict) and "tank" in v.get("properties", [])}
    assert tagged == (by_subclass | ADDED) - REMOVED
    assert {"Malphite", "KSante", "Sion", "Garen", "Sett"} <= tagged
    assert not {"Xayah", "Tristana", "Yuumi", "JarvanIV"} & tagged
