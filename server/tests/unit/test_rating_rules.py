"""Règles de conversion faits publiés → notes (spec 2026-09-25, §4.2)."""
from app.services.rating_rules import DIMENSIONS, ChampionFacts, derive, RULES


def facts(**kw):
    base = dict(key="X", damage=2, durability=1, crowd_control=2, mobility=1, utility=1,
                style=5, ranged=True, subclasses=frozenset())
    base.update(kw)
    return ChampionFacts(**base)


def rate(dim, **kw):
    return RULES[dim](facts(**kw))


def test_vector_follows_the_override_order():
    assert DIMENSIONS == ("cc", "engage", "poke", "splitpush", "teamfight", "utility", "burst", "dps", "tankiness")
    assert len(derive(facts())) == 9


def test_cc_follows_riot_control_and_tops_out_on_durable_controllers():
    assert [rate("cc", crowd_control=c) for c in (0, 1, 2, 3)] == [1, 2, 3, 4]
    assert rate("cc", crowd_control=3, durability=3) == 5, "Leona, Nautilus, Alistar"


def test_tankiness_counts_mobility_as_survival():
    """Arbitrage du joueur : survivabilité effective, pas résistance brute."""
    assert rate("tankiness", durability=1, mobility=1) == 1
    assert rate("tankiness", durability=1, mobility=3) == 3
    assert rate("tankiness", durability=3, mobility=3) == 5


def test_style_splits_damage_between_dps_and_burst():
    auto = dict(damage=3, style=2)
    spells = dict(damage=3, style=9)
    assert rate("dps", **auto) == 5 and rate("burst", **auto) == 4
    assert rate("burst", **spells) == 5 and rate("dps", **spells) == 2


def test_poke_needs_range_and_peaks_on_artillery():
    assert rate("poke", ranged=False) == 1
    assert rate("poke", subclasses=frozenset({"Artillery"})) == 5
    assert rate("poke", style=8) == 4
    assert rate("poke", style=2, subclasses=frozenset({"Marksman"})) == 3


def test_engage_reads_subclasses_before_riot_numbers():
    assert rate("engage", subclasses=frozenset({"Vanguard"})) == 5
    assert rate("engage", subclasses=frozenset({"Catcher"})) == 4
    assert rate("engage", crowd_control=2, mobility=2) == 3
    assert rate("engage", crowd_control=0, mobility=1) == 1


def test_splitpush_anchors_are_the_only_named_champions():
    assert rate("splitpush", key="Fiora") == 5
    assert rate("splitpush", subclasses=frozenset({"Juggernaut"})) == 4
    assert rate("splitpush", subclasses=frozenset({"Marksman"})) == 2
    assert rate("splitpush") == 1


def test_utility_rewards_enchanters():
    assert rate("utility", utility=3) == 5
    assert rate("utility", utility=1, subclasses=frozenset({"Enchanter"})) == 3


def test_teamfight_fallback_before_pro_data():
    assert rate("teamfight", subclasses=frozenset({"Warden"})) == 4
    assert rate("teamfight") == 3


def test_every_rule_stays_in_range_on_degenerate_facts():
    """Revue : un champion sans playstyle (zéros) ne doit ni planter ni sortir de [1, 5]."""
    zero = facts(damage=0, durability=0, crowd_control=0, mobility=0, utility=0, style=0, ranged=False)
    maxed = facts(damage=3, durability=3, crowd_control=3, mobility=3, utility=3, style=10,
                  subclasses=frozenset({"Enchanter", "Vanguard", "Artillery", "Juggernaut"}))
    for f in (zero, maxed):
        assert all(1 <= v <= 5 for v in derive(f))
