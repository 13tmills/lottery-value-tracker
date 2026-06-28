#!/usr/bin/env python3
"""
split_risk.py — estimate lottery participation (tickets in play) and the
probability a jackpot is won / split, for the games that publish per-tier
winner counts (Powerball and Lotto America).

Method (no invented data):
  * For each past draw, invert the game's published FIXED-tier odds against the
    lottery's reported number of winners in each lower tier: winners x odds ~=
    tickets that matched that tier ~= total lines in play. We take the median
    across the stable high-count tiers for robustness.
  * P(someone wins) and P(split | someone wins) come from a Poisson model on
    those estimated lines and the jackpot odds.
  * The UPCOMING-draw figure is the historical MEDIAN tickets for past draws in
    the same advertised-jackpot band — a descriptive benchmark, not a forecast.
    Every draw is independent.

Run from repo root (or anywhere): writes ../split_risk.json next to data.json.
Mirrors scraper/gen_split_risk.ps1.
"""
from __future__ import annotations

import json
import math
import os
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GAMES = {
    "powerball": {
        "label": "Powerball", "jackpot_odds": 292201338, "ticket_price": 2,
        "jackpot_match": "5+PB",
        "odds": {"5": 11688053.52, "4+PB": 913129.18, "4": 36525.17, "3+PB": 14494.11,
                 "3": 579.76, "2+PB": 701.33, "1+PB": 91.98, "PB": 38.32},
        "stable": ["PB", "1+PB", "3", "2+PB", "3+PB", "4"],
        "edges": [0, 50, 100, 150, 200, 300, 400, 600, 800, 1000, 1500, 999999],  # $M
    },
    "lotto_america": {
        "label": "Lotto America", "jackpot_odds": 25989600, "ticket_price": 1,
        "jackpot_match": "5+SB",
        "odds": {"5": 2887733.0, "4+SB": 110594.0, "4": 12288.0, "3+SB": 2404.0,
                 "3": 267.0, "2+SB": 160.0, "1+SB": 29.0, "SB": 17.0},
        "stable": ["SB", "1+SB", "3", "2+SB", "3+SB"],
        "edges": [0, 5, 10, 15, 20, 25, 30, 40, 999999],  # $M
    },
}


def p_win(lam: float) -> float:
    return 1 - math.exp(-lam)


def p_split(lam: float) -> float:
    pw = 1 - math.exp(-lam)
    if pw <= 0:
        return 0.0
    return 1 - (lam * math.exp(-lam)) / pw


def round_lines(n: float) -> int:
    return int(round(n / 100000.0) * 100000)


def load_json(path: str):
    # utf-8-sig: tolerate a BOM if a file was ever written by PowerShell.
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def median(vals: list[float]) -> float:
    s = sorted(vals)
    return float(s[len(s) // 2])


def estimate_lines(draw: dict, cfg: dict) -> tuple[float | None, bool]:
    """Return (median tickets estimate, jackpot_won) for a draw, or (None, _)."""
    ests = []
    jwon = False
    for t in draw.get("prizes", []) or []:
        m, w = t.get("match"), t.get("winners")
        if m == cfg["jackpot_match"] and (w or 0) > 0:
            jwon = True
        if m in cfg["stable"] and m in cfg["odds"] and (w or 0) > 0:
            ests.append(float(w) * float(cfg["odds"][m]))
    if len(ests) < 3:
        return None, jwon
    return median(ests), jwon


def build_game(key: str, cfg: dict, data: dict) -> dict | None:
    hist_path = os.path.join(ROOT, "history", f"{key}.json")
    if not os.path.exists(hist_path):
        print(f"[split_risk] no history for {key}; skipping")
        return None
    hist = load_json(hist_path)
    jodds = float(cfg["jackpot_odds"])

    series = []
    for d in hist.get("draws", []):
        if not d.get("total_winners"):
            continue
        L, jwon = estimate_lines(d, cfg)
        if L is None or not d.get("jackpot") or d["jackpot"] <= 0 or L <= 0:
            continue
        lam = L / jodds
        series.append({
            "date": d["date"], "jackpot": int(d["jackpot"]), "est_lines": round_lines(L),
            "p_win": round(p_win(lam), 4), "p_split": round(p_split(lam), 4), "won": int(jwon),
        })
    if not series:
        print(f"[split_risk] no winner-bearing draws for {key}; skipping")
        return None
    series.sort(key=lambda r: r["date"])

    # jackpot bands -> median tickets
    bands = []
    edges = cfg["edges"]
    for i in range(len(edges) - 1):
        lo, hi = edges[i] * 1e6, edges[i + 1] * 1e6
        inb = [r for r in series if lo <= r["jackpot"] < hi]
        if not inb:
            continue
        med = median([r["est_lines"] for r in inb])
        lam = med / jodds
        bands.append({
            "lo_m": edges[i], "hi_m": edges[i + 1], "n": len(inb),
            "median_lines": int(med), "p_win": round(p_win(lam), 4), "p_split": round(p_split(lam), 4),
        })

    # upcoming projection from the current advertised jackpot
    node = (data.get("games") or {}).get(key) or {}
    cur_j = float(node.get("jackpot") or 0)
    upcoming = None
    for b in bands:
        if b["lo_m"] * 1e6 <= cur_j < b["hi_m"] * 1e6:
            hi_label = "+" if b["hi_m"] >= 999999 else f"${b['hi_m']}M"
            upcoming = {
                "draw_date": node.get("next_draw"), "jackpot": int(cur_j),
                "band": f"${b['lo_m']}M-{hi_label}" if hi_label == "+" else f"${b['lo_m']}M-${b['hi_m']}M",
                "est_lines": int(b["median_lines"]), "p_win": b["p_win"],
                "p_split_if_won": b["p_split"], "band_n": b["n"],
            }
            break

    latest = series[-1]
    scatter = [[round(r["jackpot"] / 1e6, 1), round(r["est_lines"] / 1e6, 2), r["won"]] for r in series]
    recent = list(reversed(series[-30:]))

    return {
        "label": cfg["label"], "jackpot_odds": int(cfg["jackpot_odds"]), "ticket_price": cfg["ticket_price"],
        "draws_analyzed": len(series),
        "upcoming": upcoming,
        "latest_actual": {
            "date": latest["date"], "jackpot": latest["jackpot"], "est_lines": latest["est_lines"],
            "p_win": latest["p_win"], "p_split_if_won": latest["p_split"], "jackpot_won": bool(latest["won"]),
        },
        "bands": bands, "scatter": scatter, "recent": recent,
    }


def main():
    data = load_json(os.path.join(ROOT, "data.json"))
    out = {
        "updated": date.today().isoformat(),
        "method": ("Tickets in play are estimated for each past draw by inverting the game's published "
                   "fixed-tier odds against the number of lower-tier winners the lottery reported "
                   "(winners x odds = tickets), taking the median across the stable tiers. Win and split "
                   "probabilities use a Poisson model on those tickets. The upcoming-draw figure is the "
                   "historical median for past draws in the same jackpot band - a descriptive benchmark, "
                   "not a prediction; every draw is independent."),
        "note": "Estimates, not official sales. Powerball and Lotto America only (the games that publish per-tier winner counts).",
        "games": {},
    }
    for key, cfg in GAMES.items():
        g = build_game(key, cfg, data)
        if g:
            out["games"][key] = g
            up = g["upcoming"]
            print(f"[split_risk] {cfg['label']}: {g['draws_analyzed']} draws; "
                  f"upcoming {'%.1fM tickets, P(win) %.1f%%' % (up['est_lines']/1e6, up['p_win']*100) if up else 'n/a'}")

    path = os.path.join(ROOT, "split_risk.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"[split_risk] wrote {path} ({os.path.getsize(path)//1024} KB)")


if __name__ == "__main__":
    main()
