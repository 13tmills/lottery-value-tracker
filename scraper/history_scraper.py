"""Historical-draw scraper for Lotto America, Powerball, and Mega Millions.

  python scraper/history_scraper.py --game lotto_america
  python scraper/history_scraper.py --game powerball --limit 200
  python scraper/history_scraper.py --game mega_millions

Two source kinds:
- "powerball_site": powerball.com draw-result pages (Lotto America, Powerball) —
  server-rendered, with jackpot/cash spans and a per-tier winners table.
- "megamillions_api": megamillions.com's JSON web service GetDrawDataByTickWithMatrix
  (the page itself is JS-rendered). Returns numbers + jackpot + cash per draw.

Incremental: keeps existing draws, fetches only missing dates (so the first run
backfills, later runs append). For games whose per-tier breakdown is reliable,
it also re-fetches draws that are missing `prizes` from the era it should exist.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import date, timedelta

import requests
from bs4 import BeautifulSoup

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)
TICKS_PER_DAY = 864_000_000_000  # .NET DateTime ticks (100ns) per day

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

HIST_DIR = os.path.join(os.path.dirname(__file__), "..", "history")
DRAW_URL = "https://www.powerball.com/draw-result?gc={gc}&date={d}"
MEGA_API = "https://www.megamillions.com/cmspages/utilservice.asmx/GetDrawDataByTickWithMatrix"
# megamillions.com is Cloudflare-fronted; send the headers a real XHR would so the
# request looks legitimate (helps, though datacenter IPs may still be blocked).
MEGA_HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": "https://www.megamillions.com/Winning-Numbers/Previous-Drawings.aspx",
    "Origin": "https://www.megamillions.com",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}

GAMES = {
    "lotto_america": {
        "kind": "powerball_site",
        "gc": "lotto-america",
        "start": date(2017, 11, 15),
        "draw_weekdays": {MON, WED, SAT},
        "white_range": (1, 52), "special_range": (1, 10),
        "number_group": "number-group-lotto-america",
        "white_class": "red-balls", "special_class": "star-ball",
        "winners_label": "Lotto America Winners", "prize_label": "Lotto America Prize",
        "tier_order": ["5+SB", "5", "4+SB", "4", "3+SB", "3", "2+SB", "1+SB", "SB"],
        "bonus_regex": r"All\s*Star\s*Bonus[^0-9]*(\d+)\s*[xX]",
        "special_key": "star_ball", "bonus_key": "all_star_bonus",
        "prizes_from": date(2017, 11, 15),
    },
    "powerball": {
        "kind": "powerball_site",
        "gc": "powerball",
        "start": date(2010, 1, 1),
        "draw_weekdays": {MON, WED, SAT},  # Monday draws only since 2021-08; pre-2021 Mondays 404 and are skipped
        "white_range": (1, 69), "special_range": (1, 26),
        "number_group": "number-group-powerball",
        "white_class": "white-balls", "special_class": "powerball",
        "winners_label": "Powerball Winners", "prize_label": "Powerball Prize",
        "tier_order": ["5+PB", "5", "4+PB", "4", "3+PB", "3", "2+PB", "1+PB", "PB"],
        "bonus_regex": r"Power\s*Play[^0-9]*(\d+)\s*[xX]",
        "special_key": "powerball", "bonus_key": "power_play",
        "prizes_from": date(2015, 10, 7),  # current 5/69+26 matrix; older eras have different tiers
    },
    "mega_millions": {
        "kind": "megamillions_api",
        "start": date(2017, 10, 31),  # earliest the data service serves
        "draw_weekdays": {TUE, FRI},
        "special_key": "mega_ball", "bonus_key": "megaplier",
    },
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def parse_money(text):
    if not text:
        return None
    m = re.search(r"\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand)?", text, re.IGNORECASE)
    if not m:
        return None
    amount = float(m.group(1).replace(",", ""))
    unit = (m.group(2) or "").lower()
    mult = {"billion": 1e9, "million": 1e6, "thousand": 1e3}.get(unit, 1)
    return int(round(amount * mult))


def draw_dates(start, end, weekdays):
    d = start
    while d <= end:
        if d.weekday() in weekdays:
            yield d
        d += timedelta(days=1)


# --------------------------------------------------------------------------- #
# powerball.com page scraping (Lotto America, Powerball)
# --------------------------------------------------------------------------- #

def fetch_page(url):
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def parse_balls(soup, cfg):
    group = soup.select_one("." + cfg["number_group"]) or soup
    whites = []
    for el in group.select("." + cfg["white_class"]):
        t = el.get_text(strip=True)
        if re.fullmatch(r"\d{1,2}", t):
            whites.append(int(t))
    whites = whites[:5]
    star = None
    star_el = group.select_one("." + cfg["special_class"])
    if star_el:
        t = star_el.get_text(strip=True)
        if re.fullmatch(r"\d{1,2}", t):
            star = int(t)
    wlo, whi = cfg["white_range"]
    slo, shi = cfg["special_range"]
    ok = (len(whites) == 5 and star is not None
          and all(wlo <= n <= whi for n in whites) and slo <= star <= shi)
    return (whites, star) if ok else (None, None)


def parse_prize_table(soup, cfg, jackpot):
    rows = []
    for tr in soup.select("tr"):
        win = tr.select_one(f'td[data-label="{cfg["winners_label"]}"]')
        prize = tr.select_one(f'td[data-label="{cfg["prize_label"]}"]')
        if win is None or prize is None:
            continue
        wtxt = win.get_text(strip=True).replace(",", "")
        rows.append((prize.get_text(" ", strip=True), int(wtxt) if wtxt.isdigit() else 0))

    order = cfg["tier_order"]
    if len(rows) < len(order):
        return None
    return [
        {"match": order[i], "prize": jackpot if i == 0 else parse_money(rows[i][0]), "winners": rows[i][1]}
        for i in range(len(order))
    ]


def amount(soup, selector, label, text):
    el = soup.select_one(selector)
    if el:
        return parse_money(el.get_text(" ", strip=True))
    m = re.search(label + r"[:\s]*([^/<]+)", text, re.IGNORECASE)
    return parse_money(m.group(1)) if m else None


def scrape_powerball_site(d, cfg):
    soup = fetch_page(DRAW_URL.format(gc=cfg["gc"], d=d.isoformat()))
    if soup is None:
        return None
    text = soup.get_text(" ", strip=True)
    jackpot = amount(soup, ".estimated-jackpot", r"Estimated\s+Jackpot", text)
    cash = amount(soup, ".cash-value", r"Cash\s+Value", text)
    whites, star = parse_balls(soup, cfg)
    if not whites or jackpot is None:
        return None

    draw = {
        "date": d.isoformat(),
        "jackpot": jackpot,
        "cash_value": cash,
        "numbers": whites,
        cfg["special_key"]: star,
    }
    bm = re.search(cfg["bonus_regex"], text, re.IGNORECASE)
    if bm:
        draw[cfg["bonus_key"]] = int(bm.group(1))

    if d >= cfg["prizes_from"]:
        prizes = parse_prize_table(soup, cfg, jackpot)
        if prizes:
            draw["prizes"] = prizes
            draw["total_winners"] = sum(p["winners"] for p in prizes)
    return draw


# --------------------------------------------------------------------------- #
# megamillions.com JSON web service (Mega Millions)
# --------------------------------------------------------------------------- #

def scrape_megamillions(d, cfg):
    ticks = (d - date(1, 1, 1)).days * TICKS_PER_DAY
    resp = requests.post(MEGA_API, json={"PlayDateTicks": str(ticks)}, headers=MEGA_HEADERS, timeout=20)
    resp.raise_for_status()
    payload = json.loads(resp.json()["d"])
    drawing = payload.get("Drawing") or {}
    jackpot = payload.get("Jackpot") or {}

    nums = [drawing.get(f"N{i}") for i in range(1, 6)]
    mball = drawing.get("MBall")
    if not all(isinstance(n, int) for n in nums) or not isinstance(mball, int):
        return None  # no draw on this date

    draw = {
        "date": d.isoformat(),
        "jackpot": int(round(jackpot["CurrentPrizePool"])) if jackpot.get("CurrentPrizePool") else None,
        "cash_value": int(round(jackpot["CurrentCashValue"])) if jackpot.get("CurrentCashValue") else None,
        "numbers": nums,
        cfg["special_key"]: mball,
    }
    mp = drawing.get("Megaplier")
    if isinstance(mp, int) and mp > 0:
        draw[cfg["bonus_key"]] = mp
    return draw


SCRAPERS = {"powerball_site": scrape_powerball_site, "megamillions_api": scrape_megamillions}


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def out_path(game):
    return os.path.join(HIST_DIR, f"{game}.json")


def load_existing(game, cfg):
    try:
        with open(out_path(game), encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"game": game, "earliest_available": cfg["start"].isoformat(), "draws": []}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True, choices=list(GAMES))
    ap.add_argument("--limit", type=int, default=0, help="max draws to fetch this run (0 = no cap)")
    ap.add_argument("--sleep", type=float, default=0.4, help="seconds between requests")
    args = ap.parse_args()

    cfg = GAMES[args.game]
    scrape = SCRAPERS[cfg["kind"]]
    has_prizes = cfg["kind"] == "powerball_site"

    data = load_existing(args.game, cfg)
    by_date = {dr["date"]: dr for dr in data.get("draws", [])}

    today = date.today()
    missing = []
    for d in draw_dates(cfg["start"], today, cfg["draw_weekdays"]):
        key = d.isoformat()
        if key not in by_date:
            missing.append(d)
        elif has_prizes and d >= cfg["prizes_from"] and not by_date[key].get("prizes"):
            missing.append(d)  # should carry a prize breakdown but doesn't — self-heal
    if args.limit:
        missing = missing[:args.limit]
    print(f"[{args.game}] {len(by_date)} on file; {len(missing)} date(s) to (re)fetch.")

    fetched = 0
    for d in missing:
        try:
            draw = scrape(d, cfg)
        except Exception as exc:
            print(f"  ! {d}: failed ({exc})")
            continue
        if draw:
            by_date[draw["date"]] = draw
            fetched += 1
            print(f"  + {d}: jackpot=${draw.get('jackpot') or 0:,} cash=${draw.get('cash_value') or 0:,}")
        time.sleep(args.sleep)

    draws = sorted(by_date.values(), key=lambda x: x["date"])
    last = draws[-1]["date"] if draws else None
    complete = bool(draws) and not any(
        dd.isoformat() not in by_date
        for dd in draw_dates(cfg["start"], date.fromisoformat(last), cfg["draw_weekdays"])
    ) if last else False

    data.update({
        "game": args.game,
        "source": "megamillions.com" if cfg["kind"] == "megamillions_api" else "powerball.com",
        "earliest_available": cfg["start"].isoformat(),
        "last_updated": date.today().isoformat(),
        "complete": complete,
        "draws": draws,
    })

    os.makedirs(HIST_DIR, exist_ok=True)
    with open(out_path(args.game), "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")

    print(f"[{args.game}] fetched {fetched}; total {len(draws)}; wrote {os.path.abspath(out_path(args.game))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
