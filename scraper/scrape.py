"""Lottery analytics scraper.

Pulls live jackpot / cash-value data for Powerball, Lotto America, and Mega
Millions, computes a value-per-dollar expected value for each, and writes the
result to ../data.json.

Design notes:
- Each game is scraped independently. If one game fails to parse, the previous
  value from data.json is preserved instead of crashing the whole run, so a
  single site change never wipes the dataset.
- Winning numbers are best-effort: if they can't be parsed and validated
  against the game's number ranges, the previous values are kept.
- Static facts (ticket price, jackpot odds, draw schedule) live in CONFIG.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import date, datetime, timedelta

import requests
from bs4 import BeautifulSoup

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data.json")

# Federal + blended-state tax haircut applied to the advertised cash value.
# 37% federal + ~26% effective blended state -> player keeps ~63%.
TAX_FACTOR = 0.63

# Python's date.weekday(): Monday=0 ... Sunday=6
MON, TUE, WED, THU, FRI, SAT, SUN = range(7)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

CONFIG = {
    "powerball": {
        "source": "powerball",          # lotteryusa.com (powerball.com went JS-only)
        "url": "https://www.lotteryusa.com/powerball/",
        "ticket_price": 2,
        "odds_jackpot": 292201338,
        "draw_days": [MON, WED, SAT],
        "special_key": "powerball",      # key name for the bonus ball in JSON
        "white_range": (1, 69),
        "special_range": (1, 26),
        # Fixed non-jackpot tiers (match, prize $, odds 1-in-N). Jackpot tier
        # is handled separately via the live cash value + odds_jackpot.
        "prize_tiers": [
            {"match": "5",    "prize": 1000000, "odds": 11688053.52},
            {"match": "4+PB", "prize": 50000,   "odds": 913129.18},
            {"match": "4",    "prize": 100,     "odds": 36525.17},
            {"match": "3+PB", "prize": 100,     "odds": 14494.11},
            {"match": "3",    "prize": 7,       "odds": 579.76},
            {"match": "2+PB", "prize": 7,       "odds": 701.33},
            {"match": "1+PB", "prize": 4,       "odds": 91.98},
            {"match": "PB",   "prize": 4,       "odds": 38.32},
        ],
        "multiplier": {
            "name": "Power Play",
            "values": [2, 3, 4, 5, 10],
            "always_on": False,
            "cost": 1,
            "note": "Optional +$1/line. Match 5 pays a flat $2M with Power Play; 10x only when the jackpot is under $150M.",
        },
    },
    "lotto_america": {
        "source": "powerball",
        "url": "https://www.lotteryusa.com/lotto-america/",
        "ticket_price": 1,
        "odds_jackpot": 25989600,
        "draw_days": [MON, WED, SAT],
        "special_key": "star_ball",
        "white_range": (1, 52),
        "special_range": (1, 10),
        # Base prizes, i.e. without the optional All Star Bonus multiplier.
        "prize_tiers": [
            {"match": "5",    "prize": 20000, "odds": 2887733},
            {"match": "4+SB", "prize": 1000,  "odds": 110594},
            {"match": "4",    "prize": 100,   "odds": 12288},
            {"match": "3+SB", "prize": 20,    "odds": 2404},
            {"match": "3",    "prize": 5,     "odds": 267},
            {"match": "2+SB", "prize": 5,     "odds": 160},
            {"match": "1+SB", "prize": 2,     "odds": 29},
            {"match": "SB",   "prize": 2,     "odds": 17},
        ],
        "multiplier": {
            "name": "All Star Bonus",
            "values": [2, 3, 4, 5],
            "always_on": False,
            "cost": 1,
            "note": "Optional +$1/line multiplier on every non-jackpot prize.",
        },
    },
    "mega_millions": {
        "source": "megamillions",
        "url": "https://www.megamillions.com/Winning-Numbers.aspx",
        "ticket_price": 5,
        # Post-April-2025 matrix: 5/70 + Mega Ball 1-24.
        "odds_jackpot": 290472336,
        "draw_days": [TUE, FRI],
        "special_key": "mega_ball",
        "white_range": (1, 70),
        "special_range": (1, 24),
        # Mega Millions always applies a random 2x-10x multiplier to every
        # non-jackpot prize. Expected value of that multiplier ~= 3.0
        # (2x@1/2.13, 3x@1/3.2, 4x@1/8, 5x@1/16, 10x@1/32), so secondary EV is
        # scaled by prize_multiplier. Prizes below are the pre-multiplier base.
        "prize_multiplier": 3.0,
        "prize_tiers": [
            {"match": "5",    "prize": 1000000, "odds": 12629232},
            {"match": "4+MB", "prize": 10000,   "odds": 893761},
            {"match": "4",    "prize": 500,     "odds": 38859},
            {"match": "3+MB", "prize": 200,     "odds": 13965},
            {"match": "3",    "prize": 10,      "odds": 607},
            {"match": "2+MB", "prize": 10,      "odds": 665},
            {"match": "1+MB", "prize": 7,       "odds": 86},
            {"match": "MB",   "prize": 5,       "odds": 35},
        ],
        "multiplier": {
            "name": "built-in multiplier",
            "values": [2, 3, 4, 5, 10],
            "always_on": True,
            "cost": 0,
            "note": "Every $5 ticket includes a random 2x-10x multiplier on non-jackpot prizes.",
        },
    },
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def parse_money(text: str) -> int | None:
    """Turn '$283 Million' / '$1.05 Billion' / 'Cash Value: $126.7 Million'
    into an integer number of dollars. Returns None if nothing matches."""
    if not text:
        return None
    m = re.search(
        r"\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand)?",
        text,
        re.IGNORECASE,
    )
    if not m:
        return None
    amount = float(m.group(1).replace(",", ""))
    unit = (m.group(2) or "").lower()
    multiplier = {"billion": 1e9, "million": 1e6, "thousand": 1e3}.get(unit, 1)
    return int(round(amount * multiplier))


def next_draw(draw_days: list[int], today: date | None = None) -> str:
    """Soonest draw date strictly after `today`, as an ISO date string."""
    today = today or date.today()
    for offset in range(1, 8):
        candidate = today + timedelta(days=offset)
        if candidate.weekday() in draw_days:
            return candidate.isoformat()
    return today.isoformat()  # unreachable; every weekday is covered in 7 days


def compute_ev(cash_value: int, cfg: dict) -> dict:
    """Expected value across the *whole* prize structure, as cents returned per
    $1 spent, split into jackpot vs. smaller-prize contributions.

    Per ticket, before tax:
        jackpot return   = cash_value / odds_jackpot
        secondary return = multiplier * Σ (prize_i / odds_i)   over fixed tiers
    Both are reduced by TAX_FACTOR (all winnings are taxable income) and divided
    by ticket price to normalise across games. Values stay well below 1.0 — the
    useful signal is the relative ranking, now including non-jackpot prizes.
    """
    odds_jp = cfg["odds_jackpot"]
    price = cfg["ticket_price"]
    multiplier = cfg.get("prize_multiplier", 1.0)

    if not odds_jp or not price:
        return {"expected_value": 0.0, "ev_breakdown": {"jackpot": 0.0, "secondary": 0.0}}

    jackpot_ret = (cash_value or 0) / odds_jp
    secondary_ret = multiplier * sum(t["prize"] / t["odds"] for t in cfg.get("prize_tiers", []))

    jackpot_pd = round(TAX_FACTOR * jackpot_ret / price, 4)
    secondary_pd = round(TAX_FACTOR * secondary_ret / price, 4)

    # Headline value is the sum of the rounded parts so the breakdown always
    # reconciles with the total (no "13.7 + 10.1 = 23.7" artifacts).
    return {
        "expected_value": round(jackpot_pd + secondary_pd, 4),
        "ev_breakdown": {"jackpot": jackpot_pd, "secondary": secondary_pd},
    }


def validate_numbers(whites, special, cfg) -> bool:
    """True only if we parsed exactly 5 in-range whites + 1 in-range special."""
    if not whites or special is None or len(whites) != 5:
        return False
    wlo, whi = cfg["white_range"]
    slo, shi = cfg["special_range"]
    if not all(wlo <= n <= whi for n in whites):
        return False
    return slo <= special <= shi


def fetch(url: str) -> BeautifulSoup:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


# --------------------------------------------------------------------------- #
# Site scrapers — each returns a partial dict of whatever it could parse
# --------------------------------------------------------------------------- #

def scrape_powerball_site(cfg: dict) -> dict:
    """Powerball and Lotto America — sourced from lotteryusa.com. powerball.com went
    JavaScript-only in 2026 (its draw-result page ships no jackpot/numbers in the
    HTML), so we read lotteryusa's server-rendered game page: the headline annuity
    jackpot, the cash value, and the latest winning numbers (5 white .c-ball--sm
    balls + the coloured special ball). Returns {} on any miss so build_game keeps
    the last-known-good values rather than clobbering them."""
    soup = fetch(cfg["url"])
    text = soup.get_text(" ", strip=True)
    html = str(soup)
    out: dict = {}

    cm = re.search(r"Cash\s*value:?\s*\$\s*[\d.,]+\s*(?:billion|million|thousand)?", text, re.IGNORECASE)
    if cm:
        out["cash_value"] = parse_money(cm.group(0))

    # Headline annuity jackpot = the first $-amount on the page; sanity-check it is
    # at least the cash value (annuity is always >= the cash option).
    jm = re.search(r"\$\s*[\d.,]+\s*(?:billion|million)", text, re.IGNORECASE)
    if jm:
        jv = parse_money(jm.group(0))
        if jv and jv >= out.get("cash_value", 0):
            out["jackpot"] = jv

    whites = [int(x) for x in re.findall(r'c-ball c-ball--sm">\s*(\d+)', html)][:5]
    sm = re.search(r'c-ball[^"]*--(?:red|gold|star|blue|green)[^"]*">\s*(\d+)', html)
    if len(whites) == 5 and sm:
        out["_balls"] = whites + [int(sm.group(1))]

    return out


MEGA_API = "https://www.megamillions.com/cmspages/utilservice.asmx/GetLatestDrawData"
MEGA_HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": "https://www.megamillions.com/Winning-Numbers.aspx",
    "Origin": "https://www.megamillions.com",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}


def scrape_megamillions(cfg: dict) -> dict:
    """megamillions.com renders its jackpot/numbers with JavaScript — the HTML
    spans (.estJackpot, .cashOpt, etc.) are empty on first load. So hit the JSON
    web service the page itself calls. A POST returns {"d": "<json string>"}.
    Verified live 2026-06-19: returns Drawing.N1-5/MBall + Jackpot.CurrentPrizePool
    / CurrentCashValue."""
    resp = requests.post(MEGA_API, json={}, headers=MEGA_HEADERS, timeout=20)
    resp.raise_for_status()
    payload = json.loads(resp.json()["d"])

    out: dict = {}
    jackpot = payload.get("Jackpot") or {}
    drawing = payload.get("Drawing") or {}

    if jackpot.get("CurrentPrizePool"):
        out["jackpot"] = int(round(jackpot["CurrentPrizePool"]))
    if jackpot.get("CurrentCashValue"):
        out["cash_value"] = int(round(jackpot["CurrentCashValue"]))

    whites = [drawing.get(f"N{i}") for i in range(1, 6)]
    mball = drawing.get("MBall")
    if all(isinstance(n, int) for n in whites) and isinstance(mball, int):
        out["_balls"] = whites + [mball]

    return out


def extract_balls(soup: BeautifulSoup) -> list[int]:
    """Collect integers from elements whose class attribute mentions 'ball'."""
    numbers: list[int] = []
    for el in soup.select('[class*="ball"]'):
        text = el.get_text(strip=True)
        if re.fullmatch(r"\d{1,2}", text):
            numbers.append(int(text))
    return numbers


SCRAPERS = {
    "powerball": scrape_powerball_site,
    "megamillions": scrape_megamillions,
}


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def load_existing() -> dict:
    try:
        with open(DATA_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"games": {}}


def build_game(key: str, cfg: dict, previous: dict) -> dict:
    """Scrape one game, falling back to previous data on any failure."""
    prev = previous.get("games", {}).get(key, {})
    game = dict(prev)  # start from last-known-good, then overlay fresh values

    # Static facts always refreshed.
    game["ticket_price"] = cfg["ticket_price"]
    game["odds_jackpot"] = cfg["odds_jackpot"]
    game["next_draw"] = next_draw(cfg["draw_days"])

    try:
        scraped = SCRAPERS[cfg["source"]](cfg)
    except Exception as exc:  # network error, markup change, etc.
        print(f"  ! {key}: scrape failed ({exc}); keeping previous values")
        scraped = {}

    if scraped.get("jackpot"):
        game["jackpot"] = scraped["jackpot"]
    if scraped.get("cash_value"):
        game["cash_value"] = scraped["cash_value"]

    balls = scraped.get("_balls")
    if balls and len(balls) >= 6:
        whites, special = balls[:5], balls[5]
        if validate_numbers(whites, special, cfg):
            game["winning_numbers"] = whites
            game[cfg["special_key"]] = special
        else:
            print(f"  ! {key}: winning numbers failed validation; keeping previous")
    elif balls:
        print(f"  ! {key}: got {len(balls)} ball(s), need >=6; keeping previous")

    ev = compute_ev(game.get("cash_value", 0), cfg)
    game["expected_value"] = ev["expected_value"]
    game["ev_breakdown"] = ev["ev_breakdown"]

    # Export the static prize structure so the frontend can break EV down by
    # tier in each game's "more details" view.
    game["prize_multiplier"] = cfg.get("prize_multiplier", 1.0)
    game["prize_tiers"] = cfg["prize_tiers"]
    game["multiplier"] = cfg.get("multiplier")

    print(
        f"  - {key}: jackpot=${game.get('jackpot', 0):,} "
        f"cash=${game.get('cash_value', 0):,} ev={game['expected_value']} "
        f"(jackpot {ev['ev_breakdown']['jackpot']} + secondary {ev['ev_breakdown']['secondary']})"
    )
    return game


def main() -> int:
    previous = load_existing()
    games = {}
    for key, cfg in CONFIG.items():
        print(f"Scraping {key} ...")
        games[key] = build_game(key, cfg, previous)

    output = {
        "last_updated": datetime.now().isoformat(timespec="seconds"),
        "assumptions": {"tax_factor": TAX_FACTOR},
        "games": games,
    }

    with open(DATA_PATH, "w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2)
        fh.write("\n")

    print(f"\nWrote {os.path.abspath(DATA_PATH)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
