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


def test_tankiness_counts_mobility_as_survival_for_fragile_champions_only():
    """Arbitrage du joueur : survivabilité effective. Calage du 25/09 : la mobilité sauve
    un champion fragile, elle ne fait pas d'un champion mi-résistant un tank."""
    assert rate("tankiness", durability=1, mobility=1) == 1
    assert rate("tankiness", durability=1, mobility=3) == 3
    assert rate("tankiness", durability=2, mobility=3) == 3
    assert rate("tankiness", durability=3, mobility=3) == 5


def test_wardens_are_front_line_whatever_riot_durability_says():
    assert rate("tankiness", durability=2, subclasses=frozenset({"Warden"})) == 5


def test_style_splits_damage_between_dps_and_burst():
    auto = dict(damage=3, style=2)
    spells = dict(damage=3, style=9)
    assert rate("dps", **auto) == 5
    assert rate("dps", **spells) == 2


def test_marksman_burst_follows_mobility():
    """Calage du 25/09 : Draven, Samira, Lucian, Tristana explosent une cible ; Jinx, Kog'Maw,
    Sivir, Aphelios font des dégâts soutenus."""
    mk = frozenset({"Marksman"})
    assert rate("burst", damage=3, style=2, mobility=1, subclasses=mk) == 3
    assert rate("burst", damage=3, style=2, mobility=2, subclasses=mk) == 4
    assert rate("burst", damage=3, style=4, mobility=3, subclasses=mk) == 5


def test_mage_burst_peaks_on_the_burst_subclass():
    assert rate("burst", damage=3, style=9) == 4
    assert rate("burst", damage=3, style=9, subclasses=frozenset({"Burst"})) == 5


def test_low_damage_champions_still_have_some_burst():
    """Calage du 25/09 : les supports d'engage et les enchanteurs sont à 2, pas 1."""
    assert rate("burst", damage=1, style=8) == 2
    assert rate("burst", damage=2, style=8) == 2
    assert rate("burst", damage=2, style=4, subclasses=frozenset({"Juggernaut"})) == 4


def test_poke_needs_range_and_damage_and_peaks_on_artillery():
    """Calage du 25/09 : un enchanteur à distance sans dégâts ne poke pas ; un tireur très
    mobile joue l'all-in."""
    assert rate("poke", ranged=False) == 1
    assert rate("poke", subclasses=frozenset({"Artillery"})) == 5
    assert rate("poke", style=8, damage=3) == 4
    assert rate("poke", style=8, damage=2) == 3
    assert rate("poke", style=8, damage=1) == 2
    assert rate("poke", style=2, subclasses=frozenset({"Marksman"})) == 3
    assert rate("poke", style=2, mobility=3, subclasses=frozenset({"Marksman"})) == 2


def test_engage_reads_subclasses_before_riot_numbers():
    assert rate("engage", subclasses=frozenset({"Vanguard"})) == 5
    assert rate("engage", ranged=False, subclasses=frozenset({"Catcher"})) == 4
    assert rate("engage", ranged=False, subclasses=frozenset({"Warden"})) == 4
    assert rate("engage", crowd_control=0, mobility=1) == 1


def test_a_fragile_ranged_catcher_does_not_start_fights():
    """Calage du 25/09 : Morgana, Zyra, Bard ne démarrent pas les combats ; Thresh si."""
    assert rate("engage", ranged=True, durability=1, crowd_control=3, subclasses=frozenset({"Catcher"})) == 3
    assert rate("engage", ranged=True, durability=2, subclasses=frozenset({"Catcher"})) == 4


def test_mobile_marksmen_can_all_in_immobile_ones_cannot():
    """Calage du 25/09 : Kai'Sa, Kalista, Samira ouvrent ; Jinx, Jhin, Caitlyn non."""
    mk = frozenset({"Marksman"})
    assert rate("engage", mobility=3, subclasses=mk) == 3
    assert rate("engage", mobility=1, subclasses=mk) == 1


def test_mobile_melee_champions_can_dive_in():
    assert rate("engage", ranged=False, mobility=3, crowd_control=1) == 4


def test_splitpush_anchors_are_the_only_named_champions():
    assert rate("splitpush", key="Fiora") == 5
    assert rate("splitpush", subclasses=frozenset({"Juggernaut"})) == 4
    assert rate("splitpush", subclasses=frozenset({"Marksman"})) == 2
    assert rate("splitpush") == 1


def test_utility_rewards_enchanters_and_wardens():
    """Calage du 25/09 : un utilitaire Riot bas vaut surtout 3 chez le joueur ; les Wardens,
    qui protègent leur équipe, sont à 5."""
    assert rate("utility", utility=3) == 5
    assert rate("utility", utility=1) == 3
    assert rate("utility", utility=1, subclasses=frozenset({"Enchanter"})) == 4
    assert rate("utility", utility=1, subclasses=frozenset({"Warden"})) == 5


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


def test_fighters_deal_sustained_damage():
    """Wiki LoL, classe Fighter : « heavy, continuous damage (or DPS) ». Garen tourne en
    continu même quand Riot le classe côté sorts."""
    for sub in ("Juggernaut", "Skirmisher", "Diver"):
        assert rate("dps", damage=2, style=8, ranged=False, subclasses=frozenset({sub})) >= 3


def test_mid_damage_mages_keep_a_real_burst():
    """Les supports à dégâts moyens sont à 2 ; un mage aux mêmes dégâts Riot ne l'est pas."""
    assert rate("burst", damage=2, style=9, subclasses=frozenset({"Burst"})) == 3
    assert rate("burst", damage=2, style=9, subclasses=frozenset({"Battlemage"})) == 3


def test_assassins_dive_a_target_they_do_not_start_the_fight():
    assert rate("engage", ranged=False, mobility=3, subclasses=frozenset({"Assassin"})) == 2
    assert rate("engage", ranged=False, mobility=3, subclasses=frozenset({"Assassin", "Catcher"})) == 4
