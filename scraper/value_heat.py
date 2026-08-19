#!/usr/bin/env python3
"""
value_heat.py - two independent dials for "how big a deal is tonight's draw".

They are deliberately NOT blended into one score:

  VALUE  a maths index: expected value per dollar wagered, split-risk adjusted,
         reported as a percentile against that game's own draw history.
  HEAT   a mania index: public attention, from rollover count, sales velocity
         and advertised-jackpot percentile.

The interesting output is the GAP between them. A long rollover run pushes Heat
toward 100 while Value can already have rolled over the peak of the EV curve,
because sales outrun the prize. That divergence is flagged for the content
pipeline rather than hidden.

WHY THE ADVERTISED JACKPOT IS NOT THE MEASURE
  * It is an annuity value that moves with interest rates - the cash-to-annuity
    ratio ran about 0.72 in 2021 and about 0.50 by 2024, so the same "$1bn"
    headline is worth materially different amounts in different years. Cash is
    the canonical field here; the annuity figure is a display label only.
  * It ignores split risk, which dominates at large jackpots.

THE MATHS
    lam          = estimated_tickets_sold / D
    split_factor = (1 - exp(-lam)) / lam
    EV_jackpot   = (1 / D) * J_cash * split_factor
    EV_total     = (fixed_tier_EV + EV_jackpot) / ticket_price

  split_factor is E[1/(1+K)] for K ~ Poisson(lam): the expected share of the
  jackpot you keep given that you have won it. Derivation:
      E[1/(1+K)] = sum_k (1/(1+k)) e^-lam lam^k / k!
                 = (1/lam) sum_k e^-lam lam^(k+1)/(k+1)!
                 = (1 - e^-lam) / lam

  NON-MONOTONICITY - DO NOT "FIX" THIS. EV per dollar is not increasing in
  jackpot size. It rises to a peak and DECLINES above it: past the peak, each
  extra dollar of jackpot draws in more than a dollar's worth of new tickets, so
  your expected share falls faster than the prize grows. If that shows up in
  output it is the correct result, and it is the most interesting thing this
  model says. `sweep_ev_curve()` exposes it; test_value_heat.py asserts it.

  Swept against the real Powerball archive (1,371 draws since the 2015 matrix
  change) the peak currently lands near $1.8bn advertised, with EV about 18%
  below peak by $3bn. Treat the exact location as soft: only a handful of draws
  have ever exceeded $1bn, so the top of the sales curve rests on very few
  observations and the peak moves with them. The SHAPE - rise, turn, decline -
  is robust; the precise turning point is not.

MATRIX AWARENESS
  Prize matrices change. Mega Millions moved to a $5 ticket with a built-in
  multiplier and revised odds on 2025-04-04, so a naive time series across that
  date compares two different games. Every game therefore carries an era_start,
  and percentiles are computed only within the current era. Matrices are read
  from data.json (written by scrape.py from the published number matrices), so
  they are not hard-coded a second time here.

  Conveniently the archive is already era-clean: the earliest draw carrying both
  per-tier winners and a cash value is 2015-10-07 for Powerball (the 5/69+1/26
  change), 2025-04-04 for Mega Millions, and the relaunch date for Lotto America.

Writes value_heat.json next to data.json. Run from anywhere.
"""
from __future__ import annotations

import json
import math
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from split_risk import GAMES as SR_GAMES, estimate_lines, load_json  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Start of the current prize matrix for each game. Draws before this are a
# different game and are excluded from percentiles rather than silently mixed in.
ERAS = {
    "powerball": {
        "start": "2015-10-07",
        "note": "5/69 + 1/26 matrix, $2 ticket (matrix change of 7 October 2015).",
    },
    "mega_millions": {
        "start": "2025-04-04",
        "note": "$5 ticket with a built-in 2x-10x multiplier and 5/70 + 1/24 matrix "
                "(relaunch of 4 April 2025). Earlier draws were a $2 game and are not comparable.",
    },
    "lotto_america": {
        "start": "2017-11-12",
        "note": "5/52 + 1/10 matrix, $1 ticket (relaunch of November 2017).",
    },
}

# Matches scrape.py's TAX_FACTOR so the headline EV here reconciles with the rest
# of the site. It is a blunt single factor, not a tax calculation.
#
# This matters more than it looks. BEFORE tax, split-adjusted EV per dollar
# genuinely EXCEEDS 1.0 at extreme Powerball jackpots - our own sweep peaks near
# 142c per dollar around $1.8bn advertised. That is a real, long-documented
# result, not a modelling error. It is also the single most misreadable number on
# this site, because "142% back" reads as a winning bet. It is not one: winnings
# are taxable, the headline is an annuity while the maths uses cash, and expected
# value says nothing about a ~1-in-292-million chance. So the headline figure we
# display is after tax, with the pre-tax figure kept alongside it and explained.
TAX_FACTOR = 0.63

# How many recent draws define "normal" sales for the velocity component of Heat.
VELOCITY_WINDOW = 26
# Heat is only meaningful with a reasonable run of history behind it.
MIN_HISTORY_FOR_PERCENTILE = 30


# --------------------------------------------------------------------------
# core maths
# --------------------------------------------------------------------------
def split_factor(lam: float) -> float:
    """E[1/(1+K)] for K ~ Poisson(lam) - the expected share of a jackpot you
    keep given you have won it. Approaches 1 as lam -> 0 (nobody else playing)
    and falls like 1/lam when the game is busy."""
    if lam <= 0:
        return 1.0
    # For very small lam the closed form loses precision; the series is exact enough.
    if lam < 1e-9:
        return 1.0 - lam / 2.0
    return (1.0 - math.exp(-lam)) / lam


def fixed_tier_ev(tiers: list[dict], multiplier: float = 1.0) -> float:
    """Summed expected value of every non-jackpot tier, in dollars per ticket.

    `multiplier` covers a built-in prize multiplier (Mega Millions applies a
    random 2x-10x to non-jackpot prizes; its expected value is ~3.0). It must
    NOT be applied to the jackpot, which the multiplier never touches."""
    return multiplier * sum(float(t["prize"]) / float(t["odds"]) for t in tiers)


def ev_per_dollar(cash: float, odds_jackpot: float, lam: float, tiers: list[dict],
                  price: float, multiplier: float = 1.0) -> float:
    """Expected value returned per DOLLAR wagered, before tax, split-adjusted."""
    if not odds_jackpot or not price:
        return 0.0
    ev_jackpot = (1.0 / float(odds_jackpot)) * float(cash) * split_factor(lam)
    return (fixed_tier_ev(tiers, multiplier) + ev_jackpot) / float(price)


def percentile_of(value: float, sample: list[float]) -> float | None:
    """Percentile rank of `value` within `sample` - the share of history at or
    below it. Recomputes naturally as draws are appended; nothing is cached."""
    if not sample:
        return None
    at_or_below = sum(1 for v in sample if v <= value)
    return round(100.0 * at_or_below / len(sample), 1)


def median(vals: list[float]) -> float:
    s = sorted(vals)
    n = len(s)
    if not n:
        return 0.0
    return float(s[n // 2]) if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0


# --------------------------------------------------------------------------
# sales model
# --------------------------------------------------------------------------
def build_sales_curve(series: list[dict]) -> list[tuple[float, float]]:
    """Advertised jackpot -> estimated tickets, as sorted (jackpot, lines) knots.

    Built from the game's own observed draws (median lines per jackpot band), so
    it is a description of how this game's sales actually respond, not a guess.
    """
    if not series:
        return []
    buckets: dict[int, list[float]] = {}
    for r in series:
        # 25 log-spaced-ish buckets are plenty; band by round millions.
        j = float(r["jackpot"])
        key = int(j // 25_000_000)
        buckets.setdefault(key, []).append(float(r["est_lines"]))
    knots = [((k * 25_000_000) + 12_500_000, median(v)) for k, v in sorted(buckets.items())]
    return knots


def sales_at(jackpot: float, knots: list[tuple[float, float]]) -> float:
    """Interpolate the sales curve; extrapolate above the top knot along the
    last observed slope (sales keep climbing past any jackpot yet seen)."""
    if not knots:
        return 0.0
    if len(knots) == 1 or jackpot <= knots[0][0]:
        return knots[0][1]
    for i in range(1, len(knots)):
        x0, y0 = knots[i - 1]
        x1, y1 = knots[i]
        if jackpot <= x1:
            if x1 == x0:
                return y1
            t = (jackpot - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    (x0, y0), (x1, y1) = knots[-2], knots[-1]
    slope = (y1 - y0) / (x1 - x0) if x1 != x0 else 0.0
    return max(0.0, y1 + slope * (jackpot - x1))


def sweep_ev_curve(knots: list[tuple[float, float]], odds_jackpot: float, tiers: list[dict],
                   price: float, cash_ratio: float, multiplier: float = 1.0,
                   max_jackpot: float = 3.0e9, step: float = 25e6) -> list[dict]:
    """EV per dollar across a synthetic range of advertised jackpots, holding the
    sales curve fixed. This is what exposes the non-monotonic peak."""
    out = []
    j = step
    while j <= max_jackpot:
        lines = sales_at(j, knots)
        lam = lines / float(odds_jackpot)
        ev = ev_per_dollar(j * cash_ratio, odds_jackpot, lam, tiers, price, multiplier)
        out.append({"jackpot": int(j), "est_lines": int(lines), "ev": round(ev, 6)})
        j += step
    return out


def curve_peak(curve: list[dict]) -> dict | None:
    if not curve:
        return None
    return max(curve, key=lambda r: r["ev"])


# --------------------------------------------------------------------------
# per-game assembly
# --------------------------------------------------------------------------
def historical_series(key: str, cfg: dict, era_start: str) -> list[dict]:
    """Every draw in the current matrix era that carries BOTH per-tier winner
    counts (so sales can be estimated) and a cash value (so EV is real, not
    derived from an annuity headline)."""
    path = os.path.join(ROOT, "history", f"{key}.json")
    if not os.path.exists(path):
        return []
    hist = load_json(path)
    cfg = dict(cfg)
    cfg["_pwin"] = sum(1.0 / float(o) for o in cfg["odds"].values())

    out = []
    for d in hist.get("draws", []):
        if d.get("date", "") < era_start:
            continue
        cash = d.get("cash_value")
        if not cash or cash <= 0:
            continue
        lines, jwon, _se = estimate_lines(d, cfg)
        if lines is None or lines <= 0:
            continue
        out.append({
            "date": d["date"],
            "jackpot": int(d.get("jackpot") or 0),
            "cash": int(cash),
            "est_lines": float(lines),
            "won": bool(jwon),
        })
    out.sort(key=lambda r: r["date"])
    return out


def rollover_run(series: list[dict]) -> int:
    """Consecutive draws since the jackpot was last won, counting back from the
    most recent draw we have winner data for."""
    n = 0
    for r in reversed(series):
        if r["won"]:
            break
        n += 1
    return n


def build_game(key: str, live: dict) -> dict | None:
    sr = SR_GAMES.get(key)
    era = ERAS.get(key)
    if not sr or not era:
        return None

    tiers = live.get("prize_tiers") or []
    price = float(live.get("ticket_price") or 0)
    odds_jp = float(live.get("odds_jackpot") or 0)
    mult = float(live.get("prize_multiplier") or 1.0)
    cash = float(live.get("cash_value") or 0)
    jackpot = float(live.get("jackpot") or 0)
    if not tiers or not price or not odds_jp or cash <= 0:
        print(f"[value_heat] {key}: incomplete live matrix; skipped")
        return None

    series = historical_series(key, sr, era["start"])
    if not series:
        print(f"[value_heat] {key}: no usable history in the current era; skipped")
        return None

    # --- historical EV, one point per draw, on that draw's own cash + own sales
    hist_ev = []
    for r in series:
        lam = r["est_lines"] / odds_jp
        hist_ev.append(ev_per_dollar(r["cash"], odds_jp, lam, tiers, price, mult))

    # --- tonight: sales come from the Poisson estimator's band median for this jackpot
    knots = build_sales_curve(series)
    est_lines = sales_at(jackpot, knots) if jackpot > 0 else median([r["est_lines"] for r in series])
    lam_now = est_lines / odds_jp
    ev_now = ev_per_dollar(cash, odds_jp, lam_now, tiers, price, mult)

    enough = len(hist_ev) >= MIN_HISTORY_FOR_PERCENTILE
    ev_pct = percentile_of(ev_now, hist_ev) if enough else None

    # --- the EV curve and where tonight sits on it
    cash_ratio = (cash / jackpot) if jackpot > 0 else 0.5
    curve = sweep_ev_curve(knots, odds_jp, tiers, price, cash_ratio, mult)
    peak = curve_peak(curve)
    past_peak = bool(peak and jackpot > peak["jackpot"])

    # --- HEAT: rollovers, sales velocity, advertised-jackpot percentile
    rollovers = rollover_run(series)
    roll_hist = []
    run = 0
    for r in series:
        if r["won"]:
            roll_hist.append(run)
            run = 0
        else:
            run += 1
    roll_pct = percentile_of(rollovers, roll_hist) if len(roll_hist) >= 10 else None

    recent = [r["est_lines"] for r in series[-VELOCITY_WINDOW:]]
    trailing = median(recent) if recent else 0.0
    velocity = (est_lines / trailing) if trailing > 0 else None
    vel_hist = []
    for i in range(VELOCITY_WINDOW, len(series)):
        base = median([r["est_lines"] for r in series[i - VELOCITY_WINDOW:i]])
        if base > 0:
            vel_hist.append(series[i]["est_lines"] / base)
    vel_pct = percentile_of(velocity, vel_hist) if (velocity is not None and len(vel_hist) >= 10) else None

    jack_hist = [r["jackpot"] for r in series if r["jackpot"] > 0]
    jack_pct = percentile_of(jackpot, jack_hist) if (jackpot > 0 and enough) else None

    parts = {"rollovers": roll_pct, "sales_velocity": vel_pct, "jackpot_size": jack_pct}
    have = [v for v in parts.values() if v is not None]
    heat_pct = round(sum(have) / len(have), 1) if have else None

    # --- the divergence that is the whole point
    divergence = None
    if heat_pct is not None and ev_pct is not None:
        gap = heat_pct - ev_pct
        if heat_pct >= 70 and gap >= 25:
            divergence = {
                "flag": "hot_but_poor",
                "gap": round(gap, 1),
                "past_ev_peak": past_peak,
                "headline": (
                    f"{live.get('label', key)} is in the {heat_pct:.0f}th percentile for public "
                    f"attention but only the {ev_pct:.0f}th for actual value per dollar"
                    + (" - this jackpot is past the peak of its own EV curve, so it is getting "
                       "bigger and worse at the same time." if past_peak
                       else ", because sales are rising faster than the prize.")
                ),
            }
        elif ev_pct >= 70 and (ev_pct - heat_pct) >= 25:
            divergence = {
                "flag": "quietly_good",
                "gap": round(ev_pct - heat_pct, 1),
                "past_ev_peak": past_peak,
                "headline": (
                    f"{live.get('label', key)} is unusually good value right now "
                    f"({ev_pct:.0f}th percentile) without the attention to match "
                    f"({heat_pct:.0f}th percentile for heat)."
                ),
            }

    return {
        "label": live.get("label") or SR_GAMES[key]["label"],
        "ticket_price": price,
        "jackpot_advertised": int(jackpot),      # display label only
        "cash_value": int(cash),                 # canonical
        "cash_ratio": round(cash_ratio, 4),
        "value": {
            # Headline is after tax, for consistency with the rest of the site and
            # because the pre-tax figure exceeds 1.0 at extreme jackpots and reads
            # as a winning bet. The percentile is identical either way: tax is a
            # constant multiplier, so it cannot change the ranking.
            "ev_per_dollar": round(ev_now * TAX_FACTOR, 6),
            "ev_per_dollar_pretax": round(ev_now, 6),
            "ev_percentile": ev_pct,
            "basis_draws": len(hist_ev),
            "era_start": era["start"],
            "era_note": era["note"],
            "est_tickets": int(est_lines),
            "lambda": round(lam_now, 4),
            "split_factor": round(split_factor(lam_now), 4),
            "fixed_tier_ev": round(fixed_tier_ev(tiers, mult), 6),
            "data_through": series[-1]["date"],
        },
        "heat": {
            "score": heat_pct,
            "components": parts,
            "rollovers": rollovers,
            "sales_velocity": round(velocity, 3) if velocity is not None else None,
        },
        "ev_curve": {
            "peak_jackpot": peak["jackpot"] if peak else None,
            "peak_ev": peak["ev"] if peak else None,
            "past_peak": past_peak,
            "points": curve[::4],   # thin for transport; full curve is reproducible
        },
        "divergence": divergence,
    }


# --------------------------------------------------------------------------
# cross-game leaderboard
# --------------------------------------------------------------------------
def leaderboard(games: dict, meta: dict) -> list[dict]:
    """Every game whose EV per dollar can be computed honestly, on one axis.

    Two classes, kept distinct rather than blended:
      * complete - every prize tier has a published fixed amount, so EV is exact.
        These are typically small state games with no rolling jackpot, and they
        frequently beat the national games precisely because they carry no split
        risk at all.
      * floor - the fixed tiers are published but a rolling jackpot tier is not,
        so the figure is a LOWER BOUND on that game's true EV, flagged as such.

    Pari-mutuel games, whose prizes depend on sales we cannot observe, are left
    out entirely rather than estimated.
    """
    rows = []
    for key, g in games.items():
        rows.append({
            "key": key, "label": g["label"], "state": None,
            "price": g["ticket_price"],
            "ev_per_dollar": g["value"]["ev_per_dollar"],
            "basis": "complete",
            "note": "Includes the jackpot at its cash value, adjusted for split risk.",
        })

    for key, m in (meta or {}).items():
        ev = (m or {}).get("ev") or {}
        levels = ev.get("levels") or {}
        price = ev.get("ticket_price")
        if not price or not levels:
            continue
        total = 0.0
        n_fixed = 0
        n_missing = 0
        for lv in levels.values():
            odds = lv.get("odds")
            prize = lv.get("prize")
            if not odds:
                continue
            if lv.get("pari") or prize is None:
                n_missing += 1
                continue
            total += float(prize) / float(odds)
            n_fixed += 1
        if n_fixed == 0:
            continue                      # nothing we can stand behind
        rows.append({
            "key": key, "label": m.get("label", key), "state": m.get("state"),
            "price": float(price),
            # TAX_FACTOR here too: the national rows are after tax, and a
            # leaderboard that mixes pre- and post-tax figures on one axis is not
            # a comparison at all.
            "ev_per_dollar": round(TAX_FACTOR * total / float(price), 6),
            "basis": "complete" if n_missing == 0 else "floor",
            "note": ("Every prize tier is a published fixed amount, so this is exact - "
                     "and it carries no split risk." if n_missing == 0 else
                     f"Fixed tiers only; {n_missing} tier(s) roll or are pari-mutuel and are "
                     "not published, so the true figure is higher than this."),
        })

    rows.sort(key=lambda r: r["ev_per_dollar"], reverse=True)
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return rows


def main() -> None:
    data = load_json(os.path.join(ROOT, "data.json"))
    try:
        meta = load_json(os.path.join(ROOT, "game_meta.json"))
    except Exception:
        meta = {}

    out_games = {}
    for key in ERAS:
        live = (data.get("games") or {}).get(key)
        if not live:
            continue
        live = dict(live)
        live.setdefault("label", SR_GAMES[key]["label"])
        g = build_game(key, live)
        if g:
            out_games[key] = g
            v, h = g["value"], g["heat"]
            print(f"[value_heat] {g['label']}: EV/$ {v['ev_per_dollar']:.4f} "
                  f"(pct {v['ev_percentile']}, {v['basis_draws']} draws), heat {h['score']}"
                  + (f", FLAG {g['divergence']['flag']}" if g["divergence"] else ""))

    board = leaderboard(out_games, meta)
    out = {
        "updated": date.today().isoformat(),
        "method": (
            "Two independent dials. VALUE is expected value per dollar wagered: the summed "
            "expected value of every fixed prize tier, plus the jackpot's cash value divided by "
            "the jackpot odds and multiplied by the expected share you would keep if you won it, "
            "all divided by the ticket price. That share is E[1/(1+K)] for K Poisson-distributed "
            "with mean lambda = estimated tickets sold / jackpot odds, which equals "
            "(1-exp(-lambda))/lambda. Estimated tickets come from inverting each draw's published "
            "per-tier winner counts against that tier's odds. Cash value is used throughout - "
            "never the advertised annuity, which moves with interest rates. Figures are before "
            "tax. HEAT is a separate attention index combining consecutive rollovers, sales "
            "velocity against the game's trailing median, and advertised-jackpot percentile. "
            "The two are never blended: value is a maths index, heat is a mania index, and the "
            "gap between them is the point."
        ),
        "caveats": (
            "Percentiles are computed only within a game's current prize matrix, because a matrix "
            "change makes earlier draws a different game. EV per dollar is NOT increasing in "
            "jackpot size: past a peak, sales rise faster than the prize and each ticket's "
            "expected share falls. Every game listed returns less than it costs."
        ),
        "games": out_games,
        "leaderboard": board,
    }
    path = os.path.join(ROOT, "value_heat.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"[value_heat] wrote {path} ({os.path.getsize(path)//1024} KB); "
          f"{len(out_games)} games, {len(board)} on the leaderboard")


if __name__ == "__main__":
    main()
