from app.scoring.ban_threat import PoolCounters, choose_bans, pool_counter_threats


def test_a_popular_counter_outranks_a_rare_pick_with_a_bigger_but_noisy_delta():
    # Taliyah bot vs Vayne: -6.5 on 130 games, 0.6 % pick rate. Ezreal: -2 on 20 000 games, 11 %.
    pool = [PoolCounters("Vayne", 1.0, {163: (130, -6.5), 81: (20_000, -2.0)})]
    threats = pool_counter_threats({163: 0.6, 81: 11.0}, pool, k=200)
    assert [t.champion_id for t in threats] == [81, 163]


def test_threat_is_the_expected_win_rate_lost_to_the_lane_opponent():
    pool = [PoolCounters("Vayne", 1.0, {1: (1_000_000, -4.0)}), PoolCounters("Jinx", 1.0, {1: (1_000_000, 2.0)})]
    [threat] = pool_counter_threats({1: 5.0, 2: 15.0}, pool, k=0)
    # Met 1 fois sur 4 ; -4 pour Vayne, rien à perdre pour Jinx : 0,25 × (4 + 0) / 2.
    assert abs(threat.value - 0.5) < 1e-9
    assert threat.countered == ["Vayne"]


def test_higher_tier_pool_champions_weigh_more():
    pool = [PoolCounters("Nilah", 1.0, {1: (50_000, -3.0)}), PoolCounters("Ashe", 0.6, {2: (50_000, -3.0)})]
    threats = pool_counter_threats({1: 5.0, 2: 5.0}, pool, k=200)
    assert [t.champion_id for t in threats] == [1, 2]


def test_opponents_that_do_not_hurt_the_pool_are_not_threats():
    pool = [PoolCounters("Vayne", 1.0, {1: (50_000, 1.5), 2: (50_000, -0.2)})]
    assert pool_counter_threats({1: 5.0, 2: 5.0}, pool, k=200) == []


def test_champions_of_my_role_take_most_ban_slots():
    assert choose_bans(role=["Ezreal", "Aphelios", "Zeri"], others=["Thresh", "Wukong"]) == ["Ezreal", "Aphelios", "Thresh"]


def test_ban_slots_are_filled_from_either_list_and_never_twice():
    assert choose_bans(role=["Ezreal"], others=["Ezreal", "Thresh", "Wukong"]) == ["Ezreal", "Thresh", "Wukong"]
    assert choose_bans(role=["Ezreal", "Aphelios", "Zeri"], others=[]) == ["Ezreal", "Aphelios", "Zeri"]
