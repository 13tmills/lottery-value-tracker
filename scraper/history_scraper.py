"""Lotto America historical-draw scraper.

Walks every Mon/Wed/Sat draw date from the game's launch (2017-11-15) to today,
fetches each draw page from powerball.com (which, unlike lottoamerica.com, shows
the cash value), and writes ../history/lotto_america.json.

It is incremental: existing draws in the JSON are kept, and only missing dates
are fetched. So the first run backfills the whole archive (~1,090 pages) and
every later run just appends the newest draw(s).

  Backfill (first run):   python scraper/history_scraper.py
  Cap requests per run:   python scraper/history_scraper.py --limit 200

NOTE: the per-draw page markup hasn't been validated against live HTML yet. The
jackpot/cash regex mirrors scrape.py; the prize-tier table parsing (parse_prize_table)
is best-effort and ordered — verify and adjust selectors on the first CI run.
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

KEY = "lotto_america"
GC = "lotto-america"
URL = "https://www.powerball.com/draw-result?gc={gc}&date={d}"
START = date(2017, 11, 15)
DRAW_WEEKDAYS = {0, 2, 5}  # Mon, Wed, Sat

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "history", f"{KEY}.json")

WHITE_RANGE = (1, 52)
STAR_RANGE = (1, 10)
# The base prize table lists tiers in this fixed order, top (jackpot) to bottom.
TIER_ORDER = ["5+SB", "5", "4+SB", "4", "3+SB", "3", "2+SB", "1+SB", "SB"]

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def parse_money(text: str) -> int | None:
    if not text:
        return None
    m = re.search(r"\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand)?", text, re.IGNORECASE)
    if not m:
        return None
    amount = float(m.group(1).replace(",", ""))
    unit = (m.group(2) or "").lower()
    mult = {"billion": 1e9, "million": 1e6, "thousand": 1e3}.get(unit, 1)
    return int(round(amount * mult))


def draw_dates(start: date, end: date):
    d = start
    while d <= end:
        if d.weekday() in DRAW_WEEKDAYS:
            yield d
        d += timedelta(days=1)


def fetch(url: str) -> BeautifulSoup | None:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def parse_balls(soup: BeautifulSoup):
    """The 5 white balls (.red-balls) + Star Ball (.star-ball) from the result.

    Validated against the live powerball.com markup: winning numbers render as
    <div class="... red-balls ..."><div>26</div></div> with the Star Ball in a
    .star-ball element. The empty .item-ball spans in the prize table carry no
    digits, so scoping to the result group keeps them out."""
    group = soup.select_one(".number-group-lotto-america") or soup
    whites = []
    for el in group.select(".red-balls"):
        t = el.get_text(strip=True)
        if re.fullmatch(r"\d{1,2}", t):
            whites.append(int(t))
    whites = whites[:5]

    star = None
    star_el = group.select_one(".star-ball")
    if star_el:
        t = star_el.get_text(strip=True)
        if re.fullmatch(r"\d{1,2}", t):
            star = int(t)

    ok = (
        len(whites) == 5
        and star is not None
        and all(WHITE_RANGE[0] <= n <= WHITE_RANGE[1] for n in whites)
        and STAR_RANGE[0] <= star <= STAR_RANGE[1]
    )
    return (whites, star) if ok else (None, None)


def parse_prize_table(soup: BeautifulSoup, jackpot):
    """Rows aligned to TIER_ORDER. The base prize table's cells carry
    data-label="Lotto America Winners" / "Lotto America Prize" (the per-row
    All Star Bonus cells use different labels, so they're ignored). Winners come
    before Prize, and the jackpot row's prize is the text "Grand Prize", so the
    advertised jackpot is substituted for tier 0."""
    rows = []
    for tr in soup.select("tr"):
        win = tr.select_one('td[data-label="Lotto America Winners"]')
        prize = tr.select_one('td[data-label="Lotto America Prize"]')
        if win is None or prize is None:
            continue
        wtxt = win.get_text(strip=True).replace(",", "")
        rows.append((prize.get_text(" ", strip=True), int(wtxt) if wtxt.isdigit() else 0))

    if len(rows) < len(TIER_ORDER):
        return None
    out = []
    for i, match in enumerate(TIER_ORDER):
        prize_txt, winners = rows[i]
        out.append({"match": match, "prize": jackpot if i == 0 else parse_money(prize_txt), "winners": winners})
    return out


def parse_draw(soup: BeautifulSoup, d: date) -> dict | None:
    text = soup.get_text(" ", strip=True)

    def amount(selector, label):
        el = soup.select_one(selector)
        if el:
            return parse_money(el.get_text(" ", strip=True))
        m = re.search(label + r"[:\s]*([^/<]+)", text, re.IGNORECASE)
        return parse_money(m.group(1)) if m else None

    jackpot = amount(".estimated-jackpot", r"Estimated\s+Jackpot")
    cash = amount(".cash-value", r"Cash\s+Value")
    whites, star = parse_balls(soup)
    if not whites or jackpot is None:
        return None  # not a valid drawn result

    draw = {
        "date": d.isoformat(),
        "jackpot": jackpot,
        "cash_value": cash,
        "numbers": whites,
        "star_ball": star,
    }

    bm = re.search(r"All\s*Star\s*Bonus[^0-9]*(\d+)\s*[xX]", text, re.IGNORECASE)
    if bm:
        draw["all_star_bonus"] = int(bm.group(1))

    prizes = parse_prize_table(soup, jackpot)
    if prizes:
        draw["prizes"] = prizes
        draw["total_winners"] = sum(p["winners"] for p in prizes)
    return draw


def load_existing() -> dict:
    try:
        with open(OUT_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"game": KEY, "source": "powerball.com", "earliest_available": START.isoformat(), "draws": []}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max draws to fetch this run (0 = no cap)")
    ap.add_argument("--sleep", type=float, default=0.5, help="seconds between requests")
    args = ap.parse_args()

    data = load_existing()
    by_date = {dr["date"]: dr for dr in data.get("draws", [])}

    today = date.today()
    missing = [d for d in draw_dates(START, today) if d.isoformat() not in by_date]
    if args.limit:
        missing = missing[:args.limit]
    print(f"{len(by_date)} draws on file; {len(missing)} missing date(s) to fetch.")

    fetched = 0
    for d in missing:
        try:
            soup = fetch(URL.format(gc=GC, d=d.isoformat()))
        except Exception as exc:
            print(f"  ! {d}: request failed ({exc})")
            continue
        if soup is None:
            continue  # no draw / page not found
        draw = parse_draw(soup, d)
        if draw:
            by_date[draw["date"]] = draw
            fetched += 1
            print(f"  + {d}: jackpot=${draw['jackpot'] or 0:,} cash=${draw['cash_value'] or 0:,}")
        else:
            print(f"  ? {d}: could not parse a result")
        time.sleep(args.sleep)

    draws = sorted(by_date.values(), key=lambda x: x["date"])
    last = draws[-1]["date"] if draws else None
    data.update({
        "game": KEY,
        "source": "powerball.com",
        "earliest_available": START.isoformat(),
        "last_updated": date.today().isoformat(),
        # "complete" once we hold every scheduled draw date through the last one.
        "complete": bool(draws) and not any(
            dd.isoformat() not in by_date for dd in draw_dates(START, date.fromisoformat(last))
        ),
        "draws": draws,
    })

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")

    print(f"Fetched {fetched} new draw(s). Total {len(draws)}. Wrote {os.path.abspath(OUT_PATH)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
