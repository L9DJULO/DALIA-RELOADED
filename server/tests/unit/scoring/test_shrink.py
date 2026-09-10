import math
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.types import Estimate, Term


def test_shrink_pulls_small_samples_to_zero_and_keeps_large_ones():
    assert shrink(4.0, 0, 200) == 0.0
    assert math.isclose(shrink(4.0, 200, 200), 2.0)
    assert shrink(4.0, 10**9, 200) > 3.99


def test_shrink_sd_decreases_with_sample():
    assert math.isclose(shrink_sd(0, 200), 50 / math.sqrt(200))
    assert shrink_sd(1000, 200) < shrink_sd(0, 200)


def test_estimate_sums_values_and_combines_sd_in_quadrature():
    est = Estimate([Term("a", 1.0, 3.0), Term("b", -0.5, 4.0)])
    assert math.isclose(est.total, 0.5)
    assert math.isclose(est.sd, 5.0)
    assert Estimate([]).total == 0.0 and Estimate([]).sd == 0.0
