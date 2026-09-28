import pytest
from app.models.draft import DraftState, PoolEntry
from app.services.mechanics import MechanicsAnalyzer
from app.services.pool_advisor import advise_pool


def draft(enemies=(), allies=(), role="top"):
    return DraftState(my_role=role, enemy_picks=[{"champion_id": cid} for cid in enemies],
                      ally_picks=[{"champion_id": cid} for cid in allies])


def test_poppy_distinguishes_dashes_blinks_and_unstoppable(catalog):
    analyzer = MechanicsAnalyzer(catalog)
    _, rules = analyzer.evaluate(catalog.get_by_key("Poppy"), draft([59, 81, 54]))
    assert rules[0]["id"] == "poppy_interrupt_dash" and rules[0]["score_delta"] == 3
    assert rules[0]["champions"] == ["JarvanIV"]
    assert rules[1]["champions"] == ["Ezreal"]
    assert "imparables" in rules[0]["caveat"]


def test_nasus_requires_relevant_target_and_accounts_for_peel(catalog):
    analyzer = MechanicsAnalyzer(catalog)
    nasus = catalog.get_by_key("Nasus")
    assert analyzer.evaluate(nasus, draft([61]))[0] == 0
    carry_score, _ = analyzer.evaluate(nasus, draft([222]))
    denied_score, rules = analyzer.evaluate(nasus, draft([222, 40]))
    assert carry_score > denied_score
    assert any(r["kind"] == "warning" and r["score_delta"] < 0 for r in rules)


def test_nilah_uses_w_not_passive(catalog):
    _, rules = MechanicsAnalyzer(catalog).evaluate(catalog.get_by_key("Nilah"), draft([222]))
    assert rules[0]["text"].startswith("W ")


def test_yasuo_combo_is_ally_only(catalog):
    analyzer = MechanicsAnalyzer(catalog)
    assert analyzer.evaluate(catalog.get_by_key("Yasuo"), draft([54]))[0] == 0
    assert analyzer.evaluate(catalog.get_by_key("Yasuo"), draft(allies=[54]))[0] > 0


def test_pool_advice_suggests_missing_tools_in_same_role(catalog):
    advice = advise_pool(catalog, "top", [PoolEntry(champion_id=75)])
    assert advice["gaps"]
    assert all(s["champion_id"] != 75 for s in advice["suggestions"])
    assert any(s["champion_id"] == 78 for s in advice["suggestions"])
    assert all("top" in catalog.get_by_id(s["champion_id"]).roles for s in advice["suggestions"])


def test_brand_answers_high_health_targets_where_velkoz_does_not(catalog):
    """Arbitrage du joueur, 25/09 : « Brand plus de dégâts sur les persos à haut PV ;
    Vel'Koz plus d'utilité ; sinon pas grand-chose qui les différencie »."""
    from app.models.champion import Champion
    analyzer = MechanicsAnalyzer(catalog)
    brand, velkoz = Champion(id=63, key="Brand", name="Brand"), Champion(id=161, key="Velkoz", name="Vel'Koz")
    assert "anti_tank" in analyzer.coverage(brand)
    assert "anti_tank" not in analyzer.coverage(velkoz)
    _, rules = analyzer.evaluate(brand, draft([54, 78], role="support"))
    assert any(r["id"] == "health_scaling_damage" for r in rules)


def _custom(key, properties=(), tags=("Mage",), magical=85):
    from app.models.champion import Champion, ChampionRatings, DamageProfile
    return Champion(id=9000 + len(key), key=key, name=key, tags=list(tags), properties=list(properties),
                    ratings=ChampionRatings(tankiness=2), damage=DamageProfile(physical=100 - magical, magical=magical))


def test_a_tank_answers_a_full_ad_comp_and_a_squishy_does_not(catalog):
    """Joueur (27/09) : encaisser un type de dégâts, « c'est plus les tanks ». Jinx, Ezreal,
    Vayne, Ashe : composition physique."""
    analyzer = MechanicsAnalyzer(catalog)
    full_ad = draft([222, 81, 67, 22])
    _, tank_rules = analyzer.evaluate(catalog.get_by_key("Malphite"), full_ad)
    _, mage_rules = analyzer.evaluate(catalog.get_by_key("Ahri"), full_ad)
    assert any(r["id"] == "resists_damage_profile" for r in tank_rules)
    assert not any(r["id"] == "resists_damage_profile" for r in mage_rules)


def test_kassadin_is_the_exception_against_ap(catalog):
    """« Kassadin c'est son passif et son Q » : encaisse l'AP sans être un tank."""
    analyzer = MechanicsAnalyzer(catalog)
    full_ap = draft([103, 61, 69], role="mid")
    kassadin = _custom("Kassadin", properties=["encaisse_ap"])
    assert any(r["id"] == "resists_damage_profile" for r in analyzer.evaluate(kassadin, full_ap)[1])
    assert not any(r["id"] == "resists_damage_profile" for r in analyzer.evaluate(kassadin, draft([222, 81, 67]))[1])


def test_the_damage_profile_needs_three_known_enemies(catalog):
    _, rules = MechanicsAnalyzer(catalog).evaluate(catalog.get_by_key("Malphite"), draft([222, 81]))
    assert not any(r["id"] == "resists_damage_profile" for r in rules)


def test_ignoring_cc_pays_against_three_hard_cc_sources(catalog):
    """Olaf et Gangplank (joueur, 27/09). Sources de CC dur : mécaniques du wiki."""
    analyzer = MechanicsAnalyzer(catalog)
    olaf = _custom("Olaf", properties=["ignore_cc"], tags=("Fighter",), magical=10)
    score, rules = analyzer.evaluate(olaf, draft([54, 59, 25], role="jungle"))
    assert score > 0 and any(r["id"] == "ignore_cc" for r in rules)
    assert analyzer.evaluate(olaf, draft([222, 81], role="jungle"))[0] == 0


def test_ally_synergies_validated_by_the_player(catalog):
    """Paquet 6 (joueur, 27/09) : protéger un hypercarry, Yone sur knock-up. Alliés seulement.
    Kalista, Soraka et Twitch, validés aussi, dégradaient la concordance : non appliqués."""
    from app.models.champion import Champion, ChampionRatings
    analyzer = MechanicsAnalyzer(catalog)

    def ally(key, cid, **kw):
        c = Champion(id=cid, key=key, name=key, tags=["Marksman"], properties=kw.pop("properties", []),
                     ratings=ChampionRatings(engage=kw.pop("engage", 1)))
        catalog._by_id[cid] = c
        return cid

    carry = ally("Hyper", 7001, properties=["hypercarry"])
    lulu = _custom("Lulu", properties=["protege_carry"])
    assert analyzer.evaluate(lulu, draft(allies=[carry], role="support"))[0] > 0
    assert analyzer.evaluate(lulu, draft([carry], role="support"))[0] == 0, "un hypercarry ennemi ne compte pas"
    assert analyzer.evaluate(_custom("Yone", tags=("Fighter",)), draft(allies=[54], role="mid"))[0] > 0   # Malphite


def test_free_poke_against_a_comp_without_engage(catalog):
    """Paquet 7 (joueur, 27/09) : Ezreal et Caitlyn pokent librement face à une composition sans
    engage. Heimerdinger écarté (« le champ est trash »)."""
    analyzer = MechanicsAnalyzer(catalog)
    ezreal = _custom("Ezreal", properties=["poke_sans_engage"], tags=("Marksman",))
    no_engage = draft([103, 61, 222], role="bot")          # Ahri, Orianna, Jinx : engage 2
    with_engage = draft([103, 61, 59], role="bot")         # Jarvan IV : engage 4
    assert any(r["id"] == "free_poke" for r in analyzer.evaluate(ezreal, no_engage)[1])
    assert not any(r["id"] == "free_poke" for r in analyzer.evaluate(ezreal, with_engage)[1])


def test_safe_first_pick_only_in_blind(catalog):
    """Pantheon et Lissandra, premiers picks sûrs (joueur, 27/09)."""
    analyzer = MechanicsAnalyzer(catalog)
    liss = _custom("Lissandra", properties=["sur_en_blind"])
    blind = DraftState(my_role="mid", my_pick_order=1)
    assert any(r["id"] == "safe_first_pick" for r in analyzer.evaluate(liss, blind)[1])
    assert not any(r["id"] == "safe_first_pick" for r in analyzer.evaluate(liss, draft([103], role="mid"))[1])


def _built(key, properties=(), tags=("Marksman",), tankiness=2, physical=80):
    from app.models.champion import Champion, ChampionRatings, DamageProfile
    return Champion(id=9100 + len(key), key=key, name=key, tags=list(tags), properties=list(properties),
                    ratings=ChampionRatings(tankiness=tankiness),
                    damage=DamageProfile(physical=physical, magical=100 - physical))


def test_survivability_alone_does_not_make_a_tank(catalog):
    """Joueur (28/09) : tank = Vanguard, Warden, Juggernaut. Xayah (tankiness 4 : R
    intouchable) n'encaisse pas une composition physique."""
    xayah = _built("Xayah", tankiness=4)
    _, rules = MechanicsAnalyzer(catalog).evaluate(xayah, draft([222, 81, 67, 22], role="bot"))
    assert not any(r["id"] == "resists_damage_profile" for r in rules)


def test_a_juggernaut_counts_as_a_tank_without_the_riot_tag(catalog):
    """Garen porte le tag Fighter et une tankiness moyenne, mais c'est un Juggernaut."""
    garen = _built("Garen", properties=["tank"], tags=("Fighter",), tankiness=3)
    _, rules = MechanicsAnalyzer(catalog).evaluate(garen, draft([222, 81, 67, 22]))
    assert any(r["id"] == "resists_damage_profile" for r in rules)


def test_health_scaling_damage_targets_tanks_not_survivable_carries(catalog):
    """Vayne contre les tanks : Jarvan IV (Diver) et un carry à tankiness 4 ne comptent pas."""
    analyzer = MechanicsAnalyzer(catalog)
    tristana = _built("Tristana", tankiness=4)
    catalog._by_id[tristana.id] = tristana
    _, rules = analyzer.evaluate(catalog.get_by_key("Vayne"), draft([59, tristana.id], role="bot"))
    assert not any(r["id"] == "health_scaling_damage" for r in rules)
    _, rules = analyzer.evaluate(catalog.get_by_key("Vayne"), draft([54], role="bot"))
    assert any(r["id"] == "health_scaling_damage" and r["champions"] == ["Malphite"] for r in rules)
