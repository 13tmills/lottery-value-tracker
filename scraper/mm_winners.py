#!/usr/bin/env python3
"""
mm_winners.py — enrich history/mega_millions.json with per-tier winner counts
from megamillions.com, for the CURRENT matrix era ($5 ticket, started 2025-04-04).

Mega Millions (unlike Powerball/Lotto America via MUSL) publishes national per-tier
winner counts through its own ASP.NET service. We read GetDrawDataByTickWithMatrix
(PlayDateTicks as a string), sum each tier's winners across the built-in random
multipliers, and store prizes[{match,prize,winners}] + total_winners — the same
shape Powerball history uses — so scraper/split_risk.py can treat MM uniformly.

Idempotent: only fetches draws that don't already have winner data, so in CI it
touches just the newest draw(s). Never raises — a failure leaves prior data intact.
Run after the MM history append, before split_risk.py.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIST = os.path.join(ROOT, "history", "mega_millions.json")
ENDPOINT = "https://www.megamillions.com/cmspages/utilservice.asmx/GetDrawDataByTickWithMatrix"
ERA_START = datetime(2025, 4, 4)  # current $5 / 5-70 / 1-24 matrix
TICKS_PER_DAY = 864_000_000_000

# PrizeTier index -> standard match label (current matrix)
TIER_LABEL = {0: "5+MB", 1: "5", 2: "4+MB", 3: "4", 4: "3+MB", 5: "3", 6: "2+MB", 7: "1+MB", 8: "MB"}


def net_ticks(dt: datetime) -> str:
    """.NET DateTime.Ticks for midnight of dt (string, as the service expects)."""
    days = (dt - datetime(1, 1, 1)).days
    return str(days * TICKS_PER_DAY)


def fetch_draw(tick: str) -> dict | None:
    body = json.dumps({"PlayDateTicks": tick}).encode("utf-8")
    req = urllib.request.Request(ENDPOINT, data=body, headers={
        "User-Agent": "Mozilla/5.0", "Accept": "application/json", "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[mm_winners] fetch failed for tick {tick}: {e}")
        return None
    d = raw.get("d", raw)
    if isinstance(d, str):
        try:
            d = json.loads(d)
        except Exception:
            return None
    return d


def enrich(draw: dict) -> bool:
    """Fetch + attach prizes/total_winners to one draw. Returns True if enriched."""
    try:
        dt = datetime.strptime(draw["date"][:10], "%Y-%m-%d")
    except Exception:
        return False
    o = fetch_draw(net_ticks(dt))
    if not o or not o.get("PrizeTiers"):
        return False
    sums: dict[int, int] = {}
    for w in o["PrizeTiers"]:
        t = int(w.get("Tier", -1))
        sums[t] = sums.get(t, 0) + int(w.get("Winners") or 0)
    prize_by_tier = {int(pt["PrizeTier"]): float(pt.get("PrizeAmount") or 0)
                     for pt in (o.get("PrizeMatrix", {}).get("PrizeTiers", []) or [])}
    prizes = []
    for t in range(9):
        prizes.append({"match": TIER_LABEL[t], "prize": int(prize_by_tier.get(t, 0)),
                       "winners": int(sums.get(t, 0))})
    draw["prizes"] = prizes
    draw["total_winners"] = int(sum(sums.values()))
    return True


def main():
    if not os.path.exists(HIST):
        print("[mm_winners] no mega_millions history; nothing to do")
        return
    with open(HIST, "r", encoding="utf-8-sig") as f:
        hist = json.load(f)

    todo = []
    for d in hist.get("draws", []):
        try:
            dt = datetime.strptime(d["date"][:10], "%Y-%m-%d")
        except Exception:
            continue
        if dt < ERA_START:
            continue
        if d.get("total_winners"):
            continue
        todo.append(d)

    if not todo:
        print("[mm_winners] all current-era MM draws already have winners")
        return

    done = 0
    for d in todo:
        if enrich(d):
            done += 1
        time.sleep(0.15)

    if done:
        with open(HIST, "w", encoding="utf-8") as f:
            json.dump(hist, f, indent=2)
        print(f"[mm_winners] enriched {done}/{len(todo)} MM draws")
    else:
        print(f"[mm_winners] no draws enriched ({len(todo)} pending; service may be unavailable)")


if __name__ == "__main__":
    main()
