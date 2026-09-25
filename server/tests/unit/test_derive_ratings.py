"""Collecte des faits publiés (scripts/derive_ratings.py)."""
import importlib.util
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "derive_ratings.py"
_spec = importlib.util.spec_from_file_location("derive_ratings", _PATH)
derive_ratings = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(derive_ratings)

DDRAGON = {"Velkoz": {"name": "Vel'Koz"}, "DrMundo": {"name": "Dr. Mundo"},
           "Nunu": {"name": "Nunu & Willump"}, "MonkeyKing": {"name": "Wukong"}}


def test_wiki_names_match_data_dragon_keys():
    assert derive_ratings.match_champion("Vel'Koz", DDRAGON) == "Velkoz"
    assert derive_ratings.match_champion("Dr. Mundo", DDRAGON) == "DrMundo"
    assert derive_ratings.match_champion("Nunu", DDRAGON) == "Nunu"
    assert derive_ratings.match_champion("Wukong", DDRAGON) == "MonkeyKing"


def test_unmatched_wiki_entries_are_reported_not_invented():
    members = {"Specialist": ["Champion classes/Specialist", "Vel'Koz"], "Juggernaut": ["Dr. Mundo"]}
    mapped, unmatched = derive_ratings.map_subclasses(members, DDRAGON)
    assert mapped == {"Velkoz": ["Specialist"], "DrMundo": ["Juggernaut"]}
    assert unmatched == ["Champion classes/Specialist"]


def test_record_becomes_facts():
    rec = {"damage": 3, "durability": 1, "crowd_control": 2, "mobility": 1, "utility": 2,
           "style": 9, "ranged": True, "subclasses": ["Artillery", "Burst"]}
    f = derive_ratings.facts_from_record("Lux", rec)
    assert f.key == "Lux" and f.style == 9 and f.subclasses == frozenset({"Artillery", "Burst"})


def test_control_report_measures_agreement_and_lists_big_gaps():
    derived = {"A": [3, 1, 1, 1, 3, 2, 2, 2, 1], "B": [5, 1, 1, 1, 3, 2, 2, 2, 1]}
    player = {"A": [3, 1, 1, 1, 5, 2, 2, 2, 1], "B": [2, 1, 1, 1, 1, 2, 2, 2, 1]}
    report = derive_ratings.control_report(derived, player)
    assert "teamfight" not in report, "remplacé par la mesure pro (spec §2)"
    assert report["cc"]["exact"] == 50.0 and report["cc"]["within1"] == 50.0
    assert report["cc"]["gaps"] == [("B", 5, 2)]


def test_merge_keeps_every_player_rating_and_role():
    overrides = {"_comment": "c", "Jinx": {"roles": ["bot"], "ratings": [2, 1, 3, 2, 5, 3, 2, 5, 1]},
                 "Zed": {"roles": ["mid", "jungle"]}}
    derived = {"Jinx": [9] * 9, "Zed": [1, 1, 1, 3, 3, 2, 5, 2, 3]}
    out = derive_ratings.merge_ratings(overrides, derived)
    assert out["Jinx"]["ratings"] == [2, 1, 3, 2, 5, 3, 2, 5, 1] and out["Jinx"]["ratings_source"] == "joueur"
    assert out["Zed"] == {"roles": ["mid", "jungle"], "ratings": [1, 1, 1, 3, 3, 2, 5, 2, 3],
                          "ratings_calcul": [1, 1, 1, 3, 3, 2, 5, 2, 3], "ratings_source": "calcul"}
    assert out["_comment"] == "c"


def test_teamfight_replaces_index_four_everywhere_player_notes_included():
    overrides = {"Jinx": {"roles": ["bot"], "ratings": [2, 1, 3, 2, 5, 3, 2, 5, 1], "ratings_source": "joueur"}}
    out = derive_ratings.apply_teamfight(overrides, {"Jinx": 3})
    assert out["Jinx"]["ratings"] == [2, 1, 3, 2, 3, 3, 2, 5, 1]
    assert out["Jinx"]["ratings_source"] == "joueur", "le reste reste au joueur"


def test_dump_keeps_crlf_without_final_newline():
    text = derive_ratings.dump_overrides({"A": {"roles": ["top"]}})
    assert "\r\n" in text and not text.endswith("\n") and '  "A": {' in text


def test_override_keys_match_data_dragon_whatever_their_case():
    """« BelVeth » dans les overrides, « Belveth » chez Data Dragon : le chargeur les
    apparie sans casse, la fusion doit faire pareil."""
    out = derive_ratings.merge_ratings({"BelVeth": {"roles": ["jungle"]}}, {"Belveth": [3] * 9})
    assert out["BelVeth"]["ratings"] == [3] * 9
    out = derive_ratings.apply_teamfight({"BelVeth": {"ratings": [3] * 9}}, {"Belveth": 5})
    assert out["BelVeth"]["ratings"][4] == 5


def test_review_list_puts_the_most_played_computed_champions_first():
    """Spec §4.5. Une note calculée fausse coûte le plus sur un champion très joué (Orianna,
    sous-notée par Riot, a retourné le cas de référence) : relire d'abord ceux-là."""
    overrides = {"Orianna": {"ratings": [1] * 9, "ratings_source": "calcul"},
                 "Zed": {"ratings": [1] * 9, "ratings_source": "calcul"},
                 "Jinx": {"ratings": [1] * 9, "ratings_source": "joueur"},
                 "Rare": {"ratings": [1] * 9, "ratings_source": "calcul"}}
    rows = [{"champion": "Orianna"}] * 40 + [{"champion": "Zed"}] * 10 + [{"champion": "Jinx"}] * 99
    assert derive_ratings.review_order(overrides, rows) == [("Orianna", 40), ("Zed", 10), ("Rare", 0)]


def test_rerunning_the_derivation_keeps_the_measured_teamfight():
    """Revue du 25/09 : --write remettait la règle de repli à la place de la mesure pro."""
    overrides = {"Zed": {"roles": ["mid"], "ratings": [1, 1, 1, 3, 1, 2, 5, 2, 3], "ratings_source": "calcul"}}
    out = derive_ratings.merge_ratings(overrides, {"Zed": [2, 2, 1, 3, 3, 3, 4, 2, 3]})
    assert out["Zed"]["ratings"][4] == 1, "teamfight mesuré conservé"
    assert out["Zed"]["ratings"][0] == 2, "le reste suit le calcul"


def test_a_computed_note_the_player_edited_becomes_his():
    """Revue du 25/09 : corriger une note calculée sans changer son marqueur ne doit pas
    être écrasé au passage suivant."""
    overrides = {"Orianna": {"roles": ["mid"], "ratings": [5, 3, 3, 1, 5, 5, 4, 2, 1],
                             "ratings_source": "calcul", "ratings_calcul": [3, 1, 3, 1, 5, 3, 3, 1, 1]}}
    out = derive_ratings.merge_ratings(overrides, {"Orianna": [3, 1, 3, 1, 3, 3, 3, 1, 1]})
    assert out["Orianna"]["ratings"] == [5, 3, 3, 1, 5, 5, 4, 2, 1]
    assert out["Orianna"]["ratings_source"] == "joueur"


def test_the_computed_vector_is_remembered_to_detect_later_edits():
    out = derive_ratings.merge_ratings({"Zed": {"roles": ["mid"]}}, {"Zed": [2, 2, 1, 3, 3, 3, 4, 2, 3]})
    assert out["Zed"]["ratings_calcul"] == [2, 2, 1, 3, 3, 3, 4, 2, 3]
