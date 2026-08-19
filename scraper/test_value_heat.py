#!/usr/bin/env python3
"""Tests for the Value/Heat model. Run with `pytest scraper/`.

The load-bearing test is test_ev_curve_is_non_monotonic: EV per dollar must RISE
then FALL as the jackpot grows. That is not a bug to be fixed - past the peak,
sales outrun the prize and each winner's expected share collapses faster than
the jackpot climbs. If someone "fixes" the model so EV rises forever, this fails.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from value_heat import (  # noqa: E402
    curve_peak,
    ev_per_dollar,
    fixed_tier_ev,
    percentile_of,
    sales_at,
    split_factor,
    sweep_ev_curve,
)

# A stand-in for Powerball's shape: $2 ticket, ~1 in 292m jackpot odds.
D = 292_201_338
PRICE = 2.0
TIERS = [
    {"match": "5", "prize": 1_000_000, "odds": 11_688_053.52},
    {"match": "4+PB", "prize": 50_000, "odds": 913_129.18},
    {"match": "4", "prize": 100, "odds": 36_525.17},
    {"match": "3+PB", "prize": 100, "odds": 14_494.11},
    {"match": "3", "prize": 7, "odds": 579.76},
    {"match": "2+PB", "prize": 7, "odds": 701.33},
    {"match": "1+PB", "prize": 4, "odds": 91.98},
    {"match": "PB", "prize": 4, "odds": 38.32},
]


# ---------------------------------------------------------------- split factor
def test_split_factor_matches_poisson_expectation():
    """split_factor(lam) must equal E[1/(1+K)] for K ~ Poisson(lam), computed
    the slow, obvious way. This is the definition the whole model rests on."""
    for lam in (0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0):
        brute = sum(
            (1.0 / (1 + k)) * math.exp(-lam) * lam ** k / math.factorial(k)
            for k in range(0, 400)
        )
        assert abs(split_factor(lam) - brute) < 1e-9, f"lam={lam}"


def test_split_factor_bounds_and_monotonicity():
    assert split_factor(0) == 1.0
    assert abs(split_factor(1e-12) - 1.0) < 1e-9      # nobody else playing: keep it all
    prev = 1.0
    for lam in [0.1 * i for i in range(1, 200)]:
        v = split_factor(lam)
        assert 0.0 < v <= 1.0
        assert v < prev                                # busier game, smaller share
        prev = v
    assert split_factor(1000) < 0.01                   # very busy: share collapses


# ------------------------------------------------------------------------- EV
def test_ev_ignores_split_risk_when_nobody_else_plays():
    """With lambda ~ 0 the jackpot term is the full cash value / odds."""
    cash = 500_000_000
    ev = ev_per_dollar(cash, D, 0.0, TIERS, PRICE)
    expected = (fixed_tier_ev(TIERS) + cash / D) / PRICE
    assert abs(ev - expected) < 1e-12


def test_ev_falls_as_more_people_play_the_same_jackpot():
    """Same prize, more tickets -> strictly less value per dollar."""
    cash = 800_000_000
    evs = [ev_per_dollar(cash, D, lines / D, TIERS, PRICE)
           for lines in (1e6, 1e7, 5e7, 2e8, 6e8)]
    assert evs == sorted(evs, reverse=True)


def test_multiplier_applies_to_fixed_tiers_only():
    """A built-in multiplier (Mega Millions) lifts non-jackpot prizes and must
    never touch the jackpot."""
    cash = 100_000_000
    plain = ev_per_dollar(cash, D, 0.5, TIERS, PRICE, multiplier=1.0)
    boosted = ev_per_dollar(cash, D, 0.5, TIERS, PRICE, multiplier=3.0)
    lift = boosted - plain
    assert abs(lift - (2.0 * fixed_tier_ev(TIERS) / PRICE)) < 1e-12


# ------------------------------------------------- the non-monotonic EV curve
def _realistic_knots():
    """Sales curve with the shape real lotteries show: near-flat at small
    jackpots, then accelerating superlinearly once a run makes the news.

    Calibrated to real volumes rather than picked arbitrarily - about 8m tickets
    at the floor and ~12m at a $100m jackpot, which is the order of magnitude the
    Powerball archive actually shows. The exponent must exceed 1 for a peak to
    exist at all: if tickets grow faster than the prize, the expected share falls
    faster than the jackpot rises. Getting the CONSTANT wrong matters too - too
    small a coefficient keeps lambda low enough that the turn happens outside any
    sane sweep range."""
    a = 1.9
    b = 4e6 / (100.0 ** a)          # -> ~12m tickets at a $100m jackpot
    knots = []
    j = 25e6
    while j <= 2.5e9:
        knots.append((j, 8e6 + b * (j / 1e6) ** a))
        j += 25e6
    return knots


def test_ev_curve_is_non_monotonic():
    """THE headline property. EV per dollar must rise to a peak and then decline
    as the advertised jackpot grows, because sales outrun the prize.

    Do not 'fix' the model to make this monotonic - the decline is the correct
    result and is the most interesting thing the meter says."""
    curve = sweep_ev_curve(_realistic_knots(), D, TIERS, PRICE,
                           cash_ratio=0.50, max_jackpot=2.5e9, step=25e6)
    evs = [p["ev"] for p in curve]
    peak = curve_peak(curve)
    peak_i = evs.index(peak["ev"])

    assert 0 < peak_i < len(evs) - 1, "peak must be interior, not at an endpoint"
    assert evs[0] < peak["ev"], "EV should rise from the small-jackpot end"
    assert evs[-1] < peak["ev"], "EV must FALL again above the peak"
    # and the decline should be a real one, not float noise
    assert (peak["ev"] - evs[-1]) / peak["ev"] > 0.05


def test_ev_curve_peak_is_a_true_turning_point():
    """Rising before the peak, falling after it - checked as a sequence rather
    than just at the endpoints, so a jagged curve cannot pass by accident."""
    curve = sweep_ev_curve(_realistic_knots(), D, TIERS, PRICE,
                           cash_ratio=0.50, max_jackpot=2.5e9, step=25e6)
    evs = [p["ev"] for p in curve]
    peak_i = evs.index(max(evs))
    rising = all(evs[i] <= evs[i + 1] + 1e-12 for i in range(0, peak_i))
    falling = all(evs[i] >= evs[i + 1] - 1e-12 for i in range(peak_i, len(evs) - 1))
    assert rising and falling


def test_flat_sales_would_make_ev_monotonic():
    """Control: the decline is caused by the SALES response, not by the maths.
    Hold sales constant and EV rises with the jackpot forever."""
    flat = [(25e6, 2e7), (2.5e9, 2e7)]
    curve = sweep_ev_curve(flat, D, TIERS, PRICE, cash_ratio=0.50,
                           max_jackpot=2.5e9, step=25e6)
    evs = [p["ev"] for p in curve]
    assert evs == sorted(evs)
    assert curve_peak(curve)["jackpot"] == curve[-1]["jackpot"]


def test_sales_curve_interpolates_and_extrapolates():
    knots = [(100e6, 1e7), (200e6, 3e7)]
    assert sales_at(50e6, knots) == 1e7                  # below the first knot
    assert abs(sales_at(150e6, knots) - 2e7) < 1e-6      # halfway
    assert sales_at(300e6, knots) > 3e7                  # extrapolates upward


# ------------------------------------------------------------- percentiles
def test_percentile_basics():
    sample = [1.0, 2.0, 3.0, 4.0]
    assert percentile_of(0.5, sample) == 0.0
    assert percentile_of(4.0, sample) == 100.0
    assert percentile_of(2.0, sample) == 50.0
    assert percentile_of(None or 5.0, sample) == 100.0
    assert percentile_of(1.0, []) is None


def test_percentile_recomputes_when_a_draw_is_appended():
    """Acceptance criterion: appending a new draw must shift the ranking, with
    no cached state carried over."""
    sample = [0.30, 0.40, 0.50, 0.60]
    before = percentile_of(0.55, sample)
    assert before == 75.0                       # 3 of 4 at or below

    sample.append(0.10)                         # a poor new draw
    assert percentile_of(0.55, sample) == 80.0  # 4 of 5 - our value ranks higher

    sample.append(0.99)                         # an excellent new draw
    assert percentile_of(0.55, sample) == round(100 * 4 / 6, 1)  # ranks lower again


def test_percentile_is_stable_under_reordering():
    """Order of history must not matter."""
    a = [0.1, 0.9, 0.5, 0.3, 0.7]
    b = sorted(a)
    assert percentile_of(0.5, a) == percentile_of(0.5, b)


# --------------------------------------------------------------- leaderboard
def test_leaderboard_separates_complete_from_floor_and_drops_unknowable():
    from value_heat import leaderboard
    meta = {
        "all_fixed": {"label": "All Fixed", "state": "XX", "ev": {"ticket_price": 1,
            "levels": {"a": {"odds": 10, "prize": 5}, "b": {"odds": 100, "prize": 50}}}},
        "has_rolling": {"label": "Has Rolling", "state": "YY", "ev": {"ticket_price": 1,
            "levels": {"jp": {"odds": 1000000}, "b": {"odds": 100, "prize": 50}}}},
        "pari_only": {"label": "Pari Only", "state": "ZZ", "ev": {"ticket_price": 1,
            "levels": {"a": {"odds": 10, "pari": True}, "b": {"odds": 100, "pari": True}}}},
    }
    rows = leaderboard({}, meta)
    by_key = {r["key"]: r for r in rows}
    assert by_key["all_fixed"]["basis"] == "complete"
    assert by_key["has_rolling"]["basis"] == "floor"
    assert "pari_only" not in by_key, "games with no publishable prize must be omitted, not guessed"
    assert [r["rank"] for r in rows] == sorted(r["rank"] for r in rows)
    assert rows[0]["ev_per_dollar"] >= rows[-1]["ev_per_dollar"]
