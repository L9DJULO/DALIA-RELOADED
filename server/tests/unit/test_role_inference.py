"""Inférence des postes adverses par élimination (arbitrage du joueur le 25/09/2026)."""
from types import SimpleNamespace

import pytest

from app.models.draft import DraftPick
from app.services.role_inference import infer_enemy_roles


class _Db:
    def __init__(self, names):
        self.names = names

    def get_by_id(self, cid):
        n = self.names[cid]
        return SimpleNamespace(name=n, key=n, roles=[])


def _infer(priors, pinned=None):
    names = {i + 1: n for i, n in enumerate(priors)}
    picks = [DraftPick(champion_id=i, role=(pinned or {}).get(n)) for i, n in names.items()]
    out = infer_enemy_roles(picks, _Db(names), priors)
    return {names[i]: d for i, d in out.items()}


def test_a_lone_enemy_keeps_its_prior():
    out = _infer({"Vladimir": {"mid": 0.62, "top": 0.24, "bot": 0.14}})
    assert out["Vladimir"] == pytest.approx({"mid": 0.62, "top": 0.24, "bot": 0.14})


def test_a_likelier_mid_pushes_a_flex_off_mid_even_below_the_old_lock_threshold():
    """Le joueur : « si un autre perso a plus de chance d'aller mid on le met mid, et Vlad passe
    top par élimination ». L'ancien verrou n'agissait qu'à 0,85 : Syndra (0,80) ne comptait pas.
    Répartitions possibles : A mid/B bot 0,12 ; A top/B mid 0,32 ; A top/B bot 0,08."""
    out = _infer({"A": {"mid": 0.6, "top": 0.4}, "B": {"mid": 0.8, "bot": 0.2}})
    assert out["A"]["mid"] == pytest.approx(0.12 / 0.52)
    assert out["A"]["top"] == pytest.approx(0.40 / 0.52)
    assert out["B"]["mid"] == pytest.approx(0.32 / 0.52)
    assert sum(out["A"].values()) == pytest.approx(1.0)


def test_a_taken_top_keeps_the_flex_on_mid():
    out = _infer({"Vladimir": {"mid": 0.62, "top": 0.24, "bot": 0.14}, "Aatrox": {"top": 0.84, "jungle": 0.16}})
    assert out["Vladimir"]["mid"] > 0.62


def test_a_revealed_role_is_certain_and_removed_from_the_others():
    out = _infer({"A": {"mid": 0.6, "top": 0.4}, "B": {"mid": 0.5, "top": 0.5}}, pinned={"B": "mid"})
    assert out["B"] == {"mid": 1.0}
    assert out["A"] == pytest.approx({"top": 1.0})


def test_no_role_is_invented_for_a_champion():
    out = _infer({"A": {"mid": 0.6, "top": 0.4}, "B": {"mid": 0.8, "bot": 0.2}})
    assert set(out["A"]) <= {"mid", "top"}


def test_impossible_priors_fall_back_to_each_prior_instead_of_failing():
    """Deux champions qui ne se jouent que mid : aucune répartition n'est possible."""
    out = _infer({"A": {"mid": 1.0}, "B": {"mid": 1.0}})
    assert out == {"A": {"mid": 1.0}, "B": {"mid": 1.0}}


def test_lane_wording_needs_the_enemy_more_likely_than_not_in_lane():
    """Seuil du joueur (25/09) : Vladimir seul, mid à 62 %, est « en lane » ; poussé top par
    une Syndra, à 25 %, il ne l'est plus."""
    from app.services.reasons import _matchup_reason
    cand, enemy = SimpleNamespace(name="Orianna"), SimpleNamespace(name="Vladimir")
    likely = _matchup_reason(cand, enemy, 3.5, True, "mid", "mid", lane_probability=0.62)
    unlikely = _matchup_reason(cand, enemy, 3.5, True, "mid", "mid", lane_probability=0.25)
    assert likely["text"].startswith("Lane favorable")
    assert unlikely["text"].startswith("Matchup favorable")


def test_lane_wording_uses_the_inferred_role_when_the_client_hides_it(catalog):
    """En ranked, le client League ne révèle jamais le poste adverse : pick.role reste vide.
    La raison lisait ce champ et ne disait donc jamais « Lane » face à un poste déduit."""
    from app.models.draft import DraftState
    from app.services.reasons import generate_reasons
    draft = DraftState(my_role="mid", enemy_picks=[{"champion_id": 157}])
    detail = {"opponent_name": "Yasuo", "opponent_role": "mid", "delta": 3.5, "is_lane_opponent": True,
              "games": 4000, "lane_probability": 0.62, "role_distribution": {"mid": 0.62, "top": 0.38}}
    reasons = generate_reasons(catalog.get_by_id(61), "mid", draft, catalog, [detail], [])
    assert any(r["text"].startswith("Lane favorable dans les matchs observes contre Yasuo") for r in reasons), reasons


def test_calibration_matchup_substrings_match_the_real_wording():
    """« Lane favorable contre X » n'apparaît jamais : le texte dit « Lane favorable dans les
    matchs observes contre X ». Une assertion « ne doit pas contenir » sur un libellé que le
    moteur ne produit pas passe toujours (Naafiri, Akali et Galio l'ont fait jusqu'au 25/09)."""
    import json
    import re
    from pathlib import Path
    from app.services.reasons import _matchup_reason
    cases = json.loads((Path(__file__).resolve().parents[1] / "calibration" / "cases.json").read_text(encoding="utf-8"))
    checked = 0
    for case in cases:
        for a in case["assertions"]:
            m = re.match(r"(Lane|Matchup) (favorable|difficile) .*contre (.+)$", a.get("substring", ""))
            if not m:
                continue
            scope, sense, name = m.groups()
            delta = 5.0 if sense == "favorable" else -5.0
            lane = scope == "Lane"
            text = _matchup_reason(SimpleNamespace(name="X"), SimpleNamespace(name=name), delta, lane, "mid", "mid",
                                   lane_probability=1.0 if lane else 0.0)["text"]
            assert a["substring"] in text, (case["id"], a["substring"], text)
            checked += 1
    assert checked >= 4
