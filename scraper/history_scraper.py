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
from datetime import date, datetime, timedelta, timezone
from html import unescape
from zoneinfo import ZoneInfo

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
# nylottery.ny.gov internal feed. Returns the last ~10 draws per NY game; only the
# *upcoming* draw carries a jackpot/cash value, so we capture it each run to build a
# per-draw jackpot history over time. The GET works from a plain residential request
# (no Cloudflare challenge); whether CI datacenter IPs are allowed is verified in CI.
NYL_API = "https://nylottery.ny.gov/nyl-api/games/all/draws"
# Drupal feed behind the "Past Winning Numbers" page: a rolling ~1 year of draws
# with realized per-tier prize amounts + winner counts and the per-draw jackpot/cash.
# We merge it in each run and keep aged-out draws, so the enriched archive grows.
NYL_DRUPAL_API = "https://nylottery.ny.gov/drupal-api/api/v2/winning_numbers"
NYL_HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}
ET = ZoneInfo("America/New_York")
# texaslottery.com publishes plain CSV winning-number histories (numbers only) plus
# an estimated-jackpot-per-draw results table — static files, no bot protection.
TX_GAMES_BASE = "https://www.texaslottery.com/export/sites/lottery/Games"
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
    # State games via data.ny.gov Socrata API (reachable from CI; one bulk call).
    "ny_lotto": {
        "kind": "ny_socrata", "dataset": "6nbc-h7bj",
        "numbers_field": "winning_numbers", "num_count": 6,
        "special_field": "bonus", "special_key": "bonus",
        "nyl_key": "lotto",  # /nyl-api feed key — upcoming estimated jackpot + cash
        "nyl_nid": 26,       # Drupal node id — realized prizes, winners, jackpot/cash
    },
    "ny_take5": {
        "kind": "ny_socrata", "dataset": "dg63-4siq",
        "numbers_field": "evening_winning_numbers", "num_count": 5,
        "nyl_nid": 36, "nyl_draw_time": "Evening",  # twice daily — keep evening
    },
    "ny_pick10": {
        "kind": "ny_socrata", "dataset": "bycu-cw7c",
        "numbers_field": "winning_numbers", "num_count": 20,
        "nyl_nid": 56,  # realized winner counts (prize amounts are fixed, set in UI)
    },
    "ny_win4": {  # 4-digit game; winner counts by bet type
        "kind": "ny_socrata", "dataset": "hsys-3def",
        "numbers_field": "evening_win_4", "num_count": 4, "digits": True,
        "nyl_nid": 46, "nyl_draw_time": "Evening",
    },
    "ny_numbers": {  # 3-digit game (sibling of Win 4, same dataset)
        "kind": "ny_socrata", "dataset": "hsys-3def",
        "numbers_field": "evening_daily", "num_count": 3, "digits": True,
        "nyl_nid": 41, "nyl_draw_time": "Evening",
    },
    "ny_m4l": {  # Millionaire For Life — 5 + Mill Ball, fixed/for-life prizes
        "kind": "ny_socrata", "dataset": "a4w9-a3tp",
        "numbers_field": "winning_numbers", "num_count": 5,
        "special_field": "mill_ball", "special_key": "mill_ball",
        "nyl_nid": 374901,
    },
    "ny_cash4life": {  # retired Feb 2026 (replaced by Millionaire For Life)
        "kind": "ny_socrata", "dataset": "kwxv-fwze",
        "numbers_field": "winning_numbers", "num_count": 5,
        "special_field": "cash_ball", "special_key": "cash_ball",
        "nyl_nid": 31, "retired": True,
    },
    "ny_quickdraw": {  # keno every ~4 min — keep a recent window only (no per-draw prizes)
        "kind": "ny_socrata", "dataset": "7sqk-ycpk",
        "numbers_field": "winning_numbers", "num_count": 20, "cap": 600,
    },
    # ----- Texas (texaslottery.com CSV exports) -----
    "tx_lotto": {  # Lotto Texas — 6 of 54 jackpot game (+ per-tier prizes/winners + cash)
        "kind": "texas_csv", "game_path": "Lotto_Texas",
        "csv": "lottotexas.csv", "num_count": 6, "sort": True, "jackpot": True,
        "details": True, "details_cap": 50,
    },
    "tx_twostep": {  # Texas Two Step — 4 of 35 + Bonus, jackpot game
        "kind": "texas_csv", "game_path": "Texas_Two_Step",
        "csv": "texastwostep.csv", "num_count": 4, "sort": True, "special_key": "bonus", "jackpot": True,
        "details": True, "details_cap": 50,  # per-tier prizes/winners (no cash option)
    },
    "tx_cashfive": {  # Cash Five — 5 of 35 (no jackpot)
        "kind": "texas_csv", "game_path": "Cash_Five",
        "csv": "cashfive.csv", "num_count": 5, "sort": True,
        "details": True, "details_cap": 50,  # per-tier prizes/winners (no jackpot)
    },
    # Texas games with no CSV export — parsed from the results HTML table.
    "tx_pick3": {  # 3-digit, 4x/day; keep the latest draw per date
        "kind": "texas_html", "game_path": "Pick_3", "num_count": 3,
    },
    "tx_daily4": {  # 4-digit, 4x/day
        "kind": "texas_html", "game_path": "Daily_4", "num_count": 4,
    },
    "tx_allornothing": {  # 12 of 24 keno, 4x/day — recent window
        "kind": "texas_html", "game_path": "All_or_Nothing", "num_count": 12,
        "keno": True, "cap": 600,
    },
    # ----- California (calottery.com JSON API) ----------------------------- #
    "ca_superlotto": {  # SuperLotto Plus — 5 of 47 + Mega 1 of 27 (jackpot game)
        "kind": "calottery_api", "calottery_id": 8, "num_count": 5,
        "special_key": "mega", "max_pages": 6,  # API exposes ~1yr (~106 draws)
        # PrizeTypeDescription (API) -> our level name (matches GAME_META ev.levels).
        "tiers": {
            "5 + Mega": "Jackpot", "5": "Match 5",
            "4 + Mega": "Match 4 + Mega", "4": "Match 4",
            "3 + Mega": "Match 3 + Mega", "3": "Match 3",
            "2 + Mega": "Match 2 + Mega", "1 + Mega": "Match 1 + Mega",
            "Mega": "Mega only",
        },
    },
    "ca_fantasy5": {  # Fantasy 5 — 5 of 39, pari-mutuel (rolling top prize, no cash)
        "kind": "calottery_api", "calottery_id": 10, "num_count": 5,
        "max_pages": 12, "jackpot_tier": "Match 5",  # top tier rolls -> saw-tooth
        "tiers": {
            "Matched 5 of 5 numbers": "Match 5",
            "Matched 4 of 5 numbers": "Match 4",
            "Matched 3 of 5 numbers": "Match 3",
            "Matched 2 of 5 numbers": "Match 2",  # free Quick Pick
        },
    },
    "ca_daily4": {  # Daily 4 — 4 digits, once daily, pari-mutuel bet-type prizes
        "kind": "calottery_api", "calottery_id": 14, "num_count": 4,
        "digits": True, "max_pages": 12,
    },
    "ca_daily3": {  # Daily 3 — 3 digits, twice daily (keep evening), bet-type prizes
        "kind": "calottery_api", "calottery_id": 9, "num_count": 3,
        "digits": True, "one_per_date": True, "max_pages": 20,
    },
    "ca_derby": {  # Daily Derby — 3 placed horses + race time, exotic bets
        "kind": "calottery_api", "calottery_id": 11, "num_count": 3,
        "derby": True, "max_pages": 12, "jackpot_tier": "Grand Prize",
    },
    # ----- Idaho (idaholottery.com Drupal Views AJAX) ---------------------- #
    "id_cash": {  # Idaho Cash — 5 of 45, daily, rolling cash jackpot (fixed lower prizes)
        "kind": "idaho_views_ajax", "idaho_label": "Idaho Cash", "num_count": 5,
    },
    "id_pick3": {  # Idaho Pick 3 — 3 digits, twice daily (keep Night), fixed paytable
        "kind": "idaho_views_ajax", "idaho_label": "Pick 3", "num_count": 3, "digits": True,
    },
    "id_pick4": {  # Idaho Pick 4 — 4 digits, twice daily (keep Night), fixed paytable
        "kind": "idaho_views_ajax", "idaho_label": "Pick 4", "num_count": 4, "digits": True,
    },
    # ----- Pennsylvania (palottery.pa.gov Drawings.ashx JSON) -------------- #
    # Full draw history per game via a date-range JSON handler. We keep the Pick
    # digits (dropping the Wild Ball add-on). pa_game = the handler's drawingGameID.
    "pa_pick3": {"kind": "pa_drawings", "pa_game": 32, "num_count": 3, "digits": True},
    "pa_pick4": {"kind": "pa_drawings", "pa_game": 33, "num_count": 4, "digits": True},
    "pa_pick5": {"kind": "pa_drawings", "pa_game": 34, "num_count": 5, "digits": True},
    # ----- Florida (floridalottery.com Azure API) ------------------------- #
    # The drawgamesapp/searchgames API returns a game's FULL history for a date
    # range (numbers + the upcoming jackpot). No key — just Origin/x-partner headers.
    "fl_lotto": {"kind": "florida_api", "fl_id": 3, "num_count": 6, "fl_tiers": True},  # 6/53 since 1988 + per-tier prizes
    "fl_triple": {"kind": "florida_api", "fl_id": 23, "num_count": 6, "fl_tiers": True},  # Triple Play 6/46 + tiers
    "fl_fantasy5": {"kind": "florida_api", "fl_id": 113, "num_count": 5, "fl_draw_type": "EVENING",  # 5/36, 2x daily
                    "fl_tiers": True, "fl_top_jackpot": False},  # pari-mutuel top, no fixed jackpot
    "fl_cashpop": {"kind": "florida_api", "fl_id": 24, "num_count": 1, "fl_draw_type": "EVE", "single_wn": True},  # 1 of 15, 5x daily
    "fl_cash4life": {"kind": "florida_api", "fl_id": 138, "num_count": 5,  # 5/60 + Cash Ball — retired Feb 2026
                     "special_key": "cash_ball", "special_type": "cb", "retired": True},
    # Pick games carry big per-draw records -> the API 500s on long ranges; fetch a
    # recent window each run (retention keeps the deeper backfilled history).
    "fl_pick2": {"kind": "florida_api", "fl_id": 127, "num_count": 2, "digits": True, "fl_draw_type": "EVENING", "fl_window_years": 4},
    "fl_pick3": {"kind": "florida_api", "fl_id": 104, "num_count": 3, "digits": True, "fl_draw_type": "EVENING", "fl_window_years": 4},
    "fl_pick4": {"kind": "florida_api", "fl_id": 108, "num_count": 4, "digits": True, "fl_draw_type": "EVENING", "fl_window_years": 4},
    "fl_pick5": {"kind": "florida_api", "fl_id": 128, "num_count": 5, "digits": True, "fl_draw_type": "EVENING", "fl_window_years": 4},
    # ----- Washington (walottery.com PastDrawings.aspx — server-rendered HTML) - #
    # Each draw renders twice (mobile + desktop viewport); keying by date dedupes.
    # CI fetches the recent 2 years each run; the committed backfill + retention
    # keep the deeper history (Lotto/Hit 5/Match 4 carry per-tier prizes + WA winners).
    "wa_lotto":   {"kind": "walottery_html", "wa_name": "lotto",     "num_count": 6,  "prizes": True, "jackpot_top": True},
    "wa_hit5":    {"kind": "walottery_html", "wa_name": "hit5",      "num_count": 5,  "prizes": True, "jackpot_top": True},
    "wa_match4":  {"kind": "walottery_html", "wa_name": "match4",    "num_count": 4,  "prizes": True},
    "wa_pick3":   {"kind": "walottery_html", "wa_name": "pick3",     "num_count": 3},
    "wa_cashpop": {"kind": "walottery_html", "wa_name": "cashpop",   "num_count": 1},  # prize table layout differs; frequency-only + reference paytable
    "wa_keno":    {"kind": "walottery_html", "wa_name": "dailykeno", "num_count": 20, "cap": 600},
    # ----- Ohio (ohiolottery.com archive — recent draws embedded server-side as
    # a JSON blob id="cmsNumbers": numbers, per-tier prizes + winner counts, the
    # prize pool, and the NEXT jackpot/cash). Only latest draw(s) per game; retention
    # accumulates history (deeper history backfilled from the per-year CSV export).
    "oh_classic": {"kind": "ohio_cms", "oh_path": "Classic-Lotto",  "num_count": 6, "sort": True, "jackpot": True},
    "oh_cash5":   {"kind": "ohio_cms", "oh_path": "Rolling-Cash-5", "num_count": 5, "sort": True, "jackpot": True},
    "oh_pick3":   {"kind": "ohio_cms", "oh_path": "Pick-3", "num_count": 3, "digits": True},
    "oh_pick4":   {"kind": "ohio_cms", "oh_path": "Pick-4", "num_count": 4, "digits": True},
    "oh_pick5":   {"kind": "ohio_cms", "oh_path": "Pick-5", "num_count": 5, "digits": True},
    # Millionaire for Life — multi-state 5 + Bonus Ball; replaced Lucky for Life Feb 2026.
    "oh_m4l":     {"kind": "ohio_cms", "oh_path": "Millionaire-For-Life", "num_count": 5, "sort": True, "special_key": "bonus"},
    # Kicker — 6-digit add-on carried as ExtendedNumbers on Classic Lotto draws.
    "oh_kicker":  {"kind": "ohio_cms", "oh_path": "Classic-Lotto", "num_count": 6, "digits": True, "extended": True},
    # (oh_luckylife is a retired static archive — no scraper config; JSON is committed.)
    # ----- Michigan (michiganlottery.com Apollo GraphQL API — gameCode -> draws,
    # payout query -> per-tier prizes, currentEstimatedJackpotForGame -> jackpot) ----- #
    # Jackpot/draw games expose numbers + current jackpot (the payout query returns
    # null for them); the daily digit games carry rich per-tier prizes (phase 2).
    "mi_lotto47":  {"kind": "michigan_graphql", "mi_code": "6", "num_count": 6, "sort": True, "mi_seq": 1, "jackpot": True, "start_year": 2010},
    "mi_fantasy5": {"kind": "michigan_graphql", "mi_code": "5", "num_count": 5, "sort": True, "mi_seq": 1, "jackpot": True, "jackpot_is_cash": True, "start_year": 2010},
    "mi_lucky":    {"kind": "michigan_graphql", "mi_code": "W", "num_count": 5, "sort": True, "special_key": "lucky", "mi_special_field": "luckyball", "start_year": 2015},
    "mi_m4l":      {"kind": "michigan_graphql", "mi_code": "U", "num_count": 5, "sort": True, "special_key": "bonus", "mi_special_field": "millionaireball", "start_year": 2026},
    "mi_daily3":   {"kind": "michigan_graphql", "mi_code": "3", "num_count": 3, "digits": True, "prizes": True, "mi_payout": "eve", "prizes_cap": 45, "start_year": 2010},
    "mi_daily4":   {"kind": "michigan_graphql", "mi_code": "4", "num_count": 4, "digits": True, "prizes": True, "mi_payout": "eve", "prizes_cap": 45, "start_year": 2010},
    "mi_keno":     {"kind": "michigan_graphql", "mi_code": "K", "num_count": 22, "sort": True, "start_year": 2010},
    # Club Keno (Q) & Cash Pop (H): drawResultsBetweenDates unsupported (no history feed).
    # Poker Lotto (C): returns 1-52 card codes; card-art mapping not decodable. Not built.
    # ----- New Hampshire (NeoPollard/Gambyt game-data-service; public per-state X-API-Key) -
    # Tri-State Megabucks & Gimme 5 are shared with VT/ME. Pick 3/4 twice daily (eve tracked).
    # (nh_lucky = Lucky for Life, retired Feb 2026 -> static archive, no CI config.)
    "nh_megabucks": {"kind": "gambyt", "gambyt_key": "1c4c69db-274c-4f59-95c5-3211cd74e9d8", "gambyt_id": "2eb53665-0981-4de7-97be-64419e0909ac", "num_count": 5, "sort": True, "special_key": "megaball", "jackpot": True},
    "nh_gimme5":    {"kind": "gambyt", "gambyt_key": "1c4c69db-274c-4f59-95c5-3211cd74e9d8", "gambyt_id": "28c27816-01bb-45be-95d4-057b30ae69e4", "num_count": 5, "sort": True},
    "nh_pick3":     {"kind": "gambyt", "gambyt_key": "1c4c69db-274c-4f59-95c5-3211cd74e9d8", "gambyt_id": "b9e5389c-bb72-4faf-99b1-f2e85df6a738", "num_count": 3, "digits": True, "evening": True},
    "nh_pick4":     {"kind": "gambyt", "gambyt_key": "1c4c69db-274c-4f59-95c5-3211cd74e9d8", "gambyt_id": "9ee26a0f-4545-4fc7-b922-fdb0486b9269", "num_count": 4, "digits": True, "evening": True},
    "nh_m4l":       {"kind": "gambyt", "gambyt_key": "1c4c69db-274c-4f59-95c5-3211cd74e9d8", "gambyt_id": "2680baf8-c106-4c5c-9e65-c4a6a22f94d0", "num_count": 5, "sort": True, "special_key": "bonus"},
    # ----- North Carolina (nclottery.com per-game CSV exports) -----
    "nc_pick3":    {"kind": "nc_csv", "nc_url": "pick3", "num_count": 3, "digits": True, "evening": True, "ball_start": 2},
    "nc_pick4":    {"kind": "nc_csv", "nc_url": "pick4", "num_count": 4, "digits": True, "evening": True, "ball_start": 2},
    "nc_cash5":    {"kind": "nc_csv", "nc_url": "cash5", "num_count": 5, "sort": True, "ball_start": 1},
    # ----- Virginia (valottery.com game-page card band keeps the latest draw current;
    # deep history was seeded from the "All Past Numbers" TXT exports). va_cashpop has no
    # parseable card -> manual-only (no config). Pick 3/4 track the Night draw. -----
    "va_pick3":    {"kind": "va_page", "va_path": "pick3", "va_card": "Pick3", "num_count": 3, "digits": True, "evening": True},
    "va_pick4":    {"kind": "va_page", "va_path": "pick4", "va_card": "Pick4", "num_count": 4, "digits": True, "evening": True},
    "va_cash5":    {"kind": "va_page", "va_path": "cash5", "va_card": "Cash5", "num_count": 5, "sort": True},
    "va_bank":     {"kind": "va_page", "va_path": "bankamillion", "va_card": "BankAMillion", "num_count": 6, "sort": True, "special_key": "bonus"},

    # --- Massachusetts (13th state) — masslottery.com public API (date-window history +
    # /v3/game-payouts per-tier prizes). Megabucks Doubler 6/44 progressive; Mass Cash 5/35
    # fixed-prize, twice daily; The Numbers Game 4-digit pari-mutuel, twice daily. ----------
    "ma_megabucks": {"kind": "masslottery_api", "ma_game": "megabucks", "ma_product_id": 11,
                     "num_count": 6, "sort": True, "prizes": True, "jackpot": True, "start_year": 1994},
    "ma_masscash":  {"kind": "masslottery_api", "ma_game": "mass_cash", "ma_product_id": 12,
                     "num_count": 5, "sort": True, "start_year": 2006},  # fixed prizes; no v3 payout feed
    "ma_numbers":   {"kind": "masslottery_api", "ma_game": "the_numbers_game", "ma_product_id": 17,
                     "num_count": 4, "digits": True, "start_year": 2012},

    # --- Maryland (14th state) — mdlottery.com "Winning Numbers" tables (recent window;
    # retention accumulates). Pick 3/4/5 share one Midday/Evening table; keep evening. ----
    "md_multimatch": {"kind": "mdlottery_html", "md_table": "multi-match", "md_kind": "balls",
                      "num_count": 6, "sort": True, "md_jackpot_path": "multi-match"},
    "md_bonus5":     {"kind": "mdlottery_html", "md_table": "bonus-match-5", "md_kind": "bonus",
                      "num_count": 5, "sort": True, "special_key": "bonus"},
    "md_pick3":      {"kind": "mdlottery_html", "md_table": "pick-3-4-5", "md_kind": "pick", "md_pick_class": "pick-3", "num_count": 3, "digits": True},
    "md_pick4":      {"kind": "mdlottery_html", "md_table": "pick-3-4-5", "md_kind": "pick", "md_pick_class": "pick-4", "num_count": 4, "digits": True},
    "md_pick5":      {"kind": "mdlottery_html", "md_table": "pick-3-4-5", "md_kind": "pick", "md_pick_class": "pick-5", "num_count": 5, "digits": True},
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

SODA_BASE = "https://data.ny.gov/resource/{ds}.json"


def scrape_socrata(cfg, by_date):
    """Bulk-fetch a data.ny.gov dataset in one request (reachable from CI).
    Incremental: only rows newer than the latest date already held. Mutates
    by_date and returns how many draws were added."""
    cap = cfg.get("cap")
    if cap:
        # Recent window (Quick Draw draws every ~4 min) — replace, don't accumulate.
        params = {"$order": "draw_date DESC, draw_number DESC", "$limit": cap}
        by_date.clear()
    else:
        params = {"$order": "draw_date ASC", "$limit": 60000}
        if by_date:
            params["$where"] = f"draw_date > '{max(by_date)}T23:59:59'"
    resp = requests.get(SODA_BASE.format(ds=cfg["dataset"]), params=params,
                        headers={"User-Agent": USER_AGENT}, timeout=60)
    resp.raise_for_status()
    added = 0
    for r in resp.json():
        date_str = (r.get("draw_date") or "")[:10]
        raw = str(r.get(cfg["numbers_field"]) or "").strip()
        if cfg.get("digits"):
            # Digit games (Win 4): one string like "599" → [0,5,9,9] (zero-padded).
            digs = "".join(ch for ch in raw if ch.isdigit()).zfill(cfg["num_count"])
            nums = [int(c) for c in digs[-cfg["num_count"]:]]
        else:
            nums = [int(x) for x in raw.split() if x.isdigit()]
        if not date_str or len(nums) < cfg["num_count"]:
            continue
        draw = {"date": date_str, "numbers": nums[:cfg["num_count"]]}
        sf = cfg.get("special_field")
        if sf and str(r.get(sf, "")).strip().isdigit():
            draw[cfg["special_key"]] = int(r[sf])
        if cap:
            dn = str(r.get("draw_number", "")).strip()
            draw["draw_number"] = int(dn) if dn.isdigit() else 0
            by_date[dn or date_str] = draw  # key by draw_number (many per date)
        else:
            by_date[date_str] = draw
        added += 1
    return added


def fetch_nyl_current(nyl_key):
    """Fetch the upcoming draw's jackpot + cash value from nylottery.ny.gov.

    NY's feed only attaches a jackpot to the *upcoming* draw, so this returns the
    current estimated jackpot for the next draw — captured each run to accumulate a
    per-draw jackpot history. Returns {"date","jackpot","cash"} or None.
    """
    resp = requests.get(NYL_API, headers=NYL_HEADERS, timeout=30)
    resp.raise_for_status()
    game = (resp.json().get("data") or {}).get(nyl_key) or {}
    best = None
    for dr in game.get("draws", []):
        jk = dr.get("jackpots") or []
        amt = jk[0].get("amount") if jk else None
        if not amt or not dr.get("drawTime"):
            continue
        d = datetime.fromtimestamp(dr["drawTime"] / 1000, tz=ET).date()
        cash = jk[0].get("cashAmount")
        num = dr.get("drawNumber", 0)
        if best is None or num > best[0]:
            best = (num, {"date": d.isoformat(), "jackpot": int(amt),
                          "cash": int(cash) if cash else None})
    return best[1] if best else None


def fetch_nyl_prizes(nid, draw_time=None):
    """Paginate the Drupal winning-numbers feed (rolling ~1yr) and return a map
    date -> {prizes:[{level,amount,winners}], total_winners, [jackpot, cash]} with
    realized per-tier prize amounts and winner counts.

    Some games (Take 5, Numbers, Win4) draw twice a day; the feed carries both,
    tagged by draw_time ("Evening"/"Midday"). Pass draw_time to keep just one so it
    aligns with the single-draw-per-date number history. Prize amounts can be
    pari-mutuel decimals or labels like "FREE PLAY"; jackpot/cash apply to LOTTO only.
    """
    out = {}
    page = 0
    pages = 1
    while page < pages:
        params = {"_format": "json", "nid": nid, "page": page}
        resp = requests.get(NYL_DRUPAL_API, params=params, headers=NYL_HEADERS, timeout=30)
        resp.raise_for_status()
        body = resp.json()
        pages = int((body.get("pager") or {}).get("total_pages") or 1)
        for row in body.get("rows", []):
            if draw_time and (row.get("draw_time") or "") != draw_time:
                continue
            d = (row.get("date") or "")[:10]
            if not d:
                continue
            prizes = [{
                "level": w.get("prize_levels"),
                # Display label: the tier name, or the bet type for games (Win 4)
                # whose tiers are by wager rather than match count.
                "label": (w.get("prize_levels") if w.get("prize_levels") and w.get("prize_levels") != "N/A"
                          else w.get("wager_type")) or w.get("prize_levels"),
                "amount": _amount(w.get("prize_amount")),
                "winners": _int(w.get("prize_winners")),
            } for w in row.get("local_winners") or []]
            rec = {"prizes": prizes, "total_winners": sum(p["winners"] for p in prizes)}
            jackpot = _amount(row.get("jackpot"))
            cash = _amount(row.get("estimated_cash_option"))
            if isinstance(jackpot, (int, float)) and jackpot:
                rec["jackpot"] = int(jackpot)
            if isinstance(cash, (int, float)) and cash:
                rec["cash"] = int(cash)
            out[d] = rec
        page += 1
    return out


def _int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _amount(v):
    """Prize amount: a number when numeric (keeping pari-mutuel decimals), else the
    original label (e.g. "$1,000 a Year for Life", "FREE PLAY"), or None when blank."""
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        f = float(s.replace(",", ""))
        return int(f) if f.is_integer() else f
    except ValueError:
        return s  # keep commas/words intact for display


def scrape_texas(cfg, by_date):
    """Texas: winning numbers from the CSV export, estimated jackpot per draw from
    the results table. Mutates by_date; returns the current (latest) jackpot."""
    base = f"{TX_GAMES_BASE}/{cfg['game_path']}/Winning_Numbers"
    n = cfg["num_count"]
    csv = requests.get(f"{base}/{cfg['csv']}", headers={"User-Agent": USER_AGENT}, timeout=60).text
    for line in csv.splitlines():
        cols = [x.strip() for x in line.split(",")]
        if len(cols) < 4 + n:
            continue
        try:
            mo, dy, yr = int(cols[1]), int(cols[2]), int(cols[3])
            nums = [int(x) for x in cols[4:4 + n]]
        except ValueError:
            continue
        date_str = f"{yr:04d}-{mo:02d}-{dy:02d}"
        draw = {"date": date_str, "numbers": sorted(nums) if cfg.get("sort") else nums}
        sk = cfg.get("special_key")  # e.g. Texas Two Step bonus ball (column after the numbers)
        if sk and len(cols) > 4 + n and cols[4 + n].lstrip("-").isdigit():
            draw[sk] = int(cols[4 + n])
        # Preserve enrichment captured on earlier runs. The texaslottery.com results
        # index + detail pages only cover ~1yr, so once a draw's jackpot, per-tier
        # prizes and winner counts age off the source we keep our own copy forever —
        # the depth accumulates on NumbersIntel instead of sliding with the window.
        # (A settled draw's payouts/winners are final, so preserving is always correct.)
        prev = by_date.get(date_str)
        if prev:
            for field in ("jackpot", "prizes", "total_winners"):
                if prev.get(field) is not None:
                    draw[field] = prev[field]
        by_date[date_str] = draw
    # The results index (static HTML) gives the estimated jackpot per draw (jackpot
    # games) and links to per-draw detail pages (per-tier prizes/winners). Fetch it
    # once if we need either.
    if not (cfg.get("jackpot") or cfg.get("details")):
        return None
    page = ""
    try:
        page = requests.get(f"{base}/index.html", headers={"User-Agent": USER_AGENT}, timeout=30).text
        if cfg.get("jackpot"):
            text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", page))
            for m in re.finditer(r"(\d{2})/(\d{2})/(\d{4}).+?\$([\d,.]+)(?:\s*(Million|Billion))?", text):
                d = f"{m.group(3)}-{m.group(1)}-{m.group(2)}"
                if d in by_date:
                    amt = float(m.group(4).replace(",", ""))
                    unit = m.group(5)
                    by_date[d]["jackpot"] = int(amt * (1e9 if unit == "Billion" else 1e6 if unit == "Million" else 1))
    except Exception as exc:
        print(f"  ! texas results index fetch failed ({exc})")
    cash = None
    if cfg.get("details") and page:
        try:
            cash = enrich_texas_details(cfg, by_date, page)
        except Exception as exc:
            print(f"  ! texas detail enrichment failed ({exc})")
    if not cfg.get("jackpot"):
        return None  # non-jackpot game (e.g. Cash Five): enrichment done, no current jackpot
    for d in sorted(by_date, reverse=True):
        if by_date[d].get("jackpot"):
            cur = {"date": d, "jackpot": by_date[d]["jackpot"]}
            if cash:
                cur["cash"] = cash
            return cur
    return None


def enrich_texas_details(cfg, by_date, index_html):
    """Fetch per-draw detail pages (linked from the results index) for recent draws
    missing a prize breakdown; parse per-tier prize amounts + winner counts. Returns
    the current cash value. Bounded per run by details_cap (incremental/self-healing)."""
    base = f"{TX_GAMES_BASE}/{cfg['game_path']}/Winning_Numbers"
    pairs = {}
    for rm in re.finditer(r"(?s)<tr[^>]*>(.*?)</tr>", index_html):
        row = rm.group(1)
        dm = re.search(r"(\d{2})/(\d{2})/(\d{4})", row)
        lm = re.search(r"(details\.html_\d+\.html)", row)
        if dm and lm:
            d = f"{dm.group(3)}-{dm.group(1)}-{dm.group(2)}"
            pairs.setdefault(d, lm.group(1))
    cash = None
    fetched = 0
    cap = cfg.get("details_cap", 50)
    for d in sorted(pairs, reverse=True):
        draw = by_date.get(d)
        if not draw:
            continue
        if draw.get("prizes") and cash is not None:
            continue
        if fetched >= cap and cash is not None:
            break
        try:
            html = requests.get(f"{base}/{pairs[d]}", headers={"User-Agent": USER_AGENT}, timeout=20).text
        except Exception:
            continue
        t = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", html)))
        if not draw.get("prizes") and fetched < cap:
            prizes, tw = [], 0
            has_bonus = bool(cfg.get("special_key"))  # Two Step's "w/Bonus" tiers
            is_jackpot_game = bool(cfg.get("jackpot"))  # Cash Five's top tier isn't a jackpot
            # A tier row is "<m> of <n> [w/Bonus] <prize> <winners>", where prize is a
            # dollar amount (optionally "$X Million") or a free-play label (Cash Five's
            # "2 of 5" pays a free quick pick), and winners is a count or "Roll".
            for m in re.finditer(
                r"(\d) of \d( w/Bonus)? (\$[\d.,]+(?:\s*Million)?|Free[\w /]+?)\s+(Roll|[\d,]+)", t):
                mc = int(m.group(1))
                bonus = bool(m.group(2))
                prize_raw = m.group(3)
                if prize_raw.startswith("$"):
                    body = prize_raw[1:]
                    amt = (int(float(re.sub(r"[^\d.]", "", body)) * 1e6) if "Million" in body
                           else int(body.replace(",", "")))
                else:
                    amt = prize_raw.strip()  # free play, e.g. "Free Cash Five QP"
                w = 0 if m.group(4) == "Roll" else int(m.group(4).replace(",", ""))
                tw += w
                if is_jackpot_game and mc == cfg["num_count"] and (bonus or not has_bonus):
                    level = "Jackpot"
                elif mc == 0 and bonus:
                    level = "Bonus Ball only"
                else:
                    level = f"Match {mc}" + (" + Bonus" if bonus else "")
                prizes.append({"level": level, "amount": amt, "winners": w})
            if len(prizes) >= 4:
                draw["prizes"] = prizes
                draw["total_winners"] = tw
                fetched += 1
        if cash is None:
            min_ann = float("inf")
            for m in re.finditer(
                r"Annuitized Jackpot for \d{2}/\d{2}/\d{4}: \$([\d.]+) Million Est\. Cash Value: \$([\d.]+) Million", t):
                ann = float(m.group(1))
                if ann < min_ann:
                    min_ann = ann
                    cash = int(float(m.group(2)) * 1e6)
    return cash


CA_API = "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults"


def _parse_calottery_draw(d, cfg):
    """One calottery draw object -> our schema. Handles ball games (optional special
    ball), digit games (Daily 3/4 — pari-mutuel bet-type prizes), and Daily Derby
    (three placed horses + a race time). Per-tier prizes + winner counts throughout."""
    if not d.get("DrawDate"):
        return None
    n = cfg["num_count"]
    tiers = cfg.get("tiers") or {}
    jackpot_tier = cfg.get("jackpot_tier", "Jackpot")
    wn = d.get("WinningNumbers") or {}
    cells = [wn[k] for k in sorted(wn, key=lambda k: int(k))]
    draw = {"date": d["DrawDate"][:10]}

    if cfg.get("derby"):  # 1st/2nd/3rd placed horses (with names) + a race time
        horses = []
        for c in cells[:3]:
            try:
                horses.append({"num": int(c["Number"]), "name": c.get("Name")})
            except (ValueError, TypeError, KeyError):
                pass
        if len(horses) < 3:
            return None
        draw["numbers"] = [h["num"] for h in horses]
        draw["horses"] = horses
        if d.get("RaceTime"):
            draw["race_time"] = d["RaceTime"]
    else:
        nums, special = [], None
        for c in cells:
            try:
                val = int(c["Number"])
            except (ValueError, TypeError, KeyError):
                continue
            if c.get("IsSpecial"):
                special = val
            else:
                nums.append(val)
        if len(nums) < n:
            return None
        draw["numbers"] = nums[:n]  # digit games keep draw order (Straight matters)
        sk = cfg.get("special_key")
        if sk and special is not None:
            draw[sk] = special

    prizes, tw, jackpot = [], 0, None
    for key in sorted((d.get("Prizes") or {}), key=lambda k: int(k)):
        p = d["Prizes"][key]
        level = tiers.get(p.get("PrizeTypeDescription", ""), p.get("PrizeTypeDescription", ""))
        amt = int(p["Amount"]) if p.get("Amount") is not None else None
        w = int(p.get("Count") or 0)
        tw += w
        if level == jackpot_tier:
            jackpot = amt  # rolling top prize -> per-draw jackpot (saw-tooth)
        prizes.append({"level": level, "amount": amt, "winners": w})
    if prizes:
        draw["prizes"] = prizes
        draw["total_winners"] = tw
    if jackpot:
        draw["jackpot"] = jackpot
    return draw


def scrape_calottery(cfg, by_date):
    """California: the calottery.com draw-game API returns numbers, the rolling
    jackpot, and every prize tier's payout + winner count per draw in one JSON call.
    Paginates the recent window the API exposes (~1yr). Mutates by_date; returns the
    upcoming jackpot/cash value."""
    gid = cfg["calottery_id"]
    one_per_date = cfg.get("one_per_date")  # twice-daily games (Daily 3) -> keep evening
    kept = {}  # date -> highest DrawNumber kept this run
    current, page = None, 1
    while page <= cfg.get("max_pages", 6):
        try:
            payload = requests.get(f"{CA_API}/{gid}/{page}/50",
                                   headers={"User-Agent": USER_AGENT}, timeout=30).json()
        except Exception as exc:
            print(f"  ! calottery page {page} failed ({exc})")
            break
        if page == 1:
            nd = payload.get("NextDraw") or {}
            if nd.get("JackpotAmount") and str(nd.get("DrawDate", "")).startswith("20"):
                current = {
                    "date": nd["DrawDate"][:10],
                    "jackpot": int(nd["JackpotAmount"]),
                    "cash": int(nd["EstimatedCashValue"]) if nd.get("EstimatedCashValue") else 0,
                }
        prev = payload.get("PreviousDraws") or []
        if not prev:
            break
        for d in prev:
            draw = _parse_calottery_draw(d, cfg)
            if not draw:
                continue
            date = draw["date"]
            dn = d.get("DrawNumber") or 0
            if one_per_date:
                # API is newest-first, so the first row for a date is the later draw.
                if date in kept and dn <= kept[date]:
                    continue
                kept[date] = dn
            # Don't let a transient/changed response that omits the prize breakdown
            # clobber depth we already captured for this draw.
            old = by_date.get(date)
            if old and old.get("prizes") and not draw.get("prizes"):
                for field in ("prizes", "total_winners", "jackpot"):
                    if old.get(field) is not None and draw.get(field) is None:
                        draw[field] = old[field]
            by_date[date] = draw
        page += 1
        time.sleep(cfg.get("sleep", 0.4))
    return current


IDAHO_BASE = "https://www.idaholottery.com"


def scrape_idaho(cfg, by_date):
    """Idaho: winning numbers + per-draw rolling jackpot from the idaholottery.com
    Drupal Views AJAX endpoint (one call returns each game's last ~10 draws as a
    Date / Winning Numbers / Jackpot table). No per-tier winner data is published.
    Only ~10 draws are exposed, so history accumulates across runs (retention).
    Mutates by_date; returns the upcoming jackpot/cash."""
    label, n = cfg["idaho_label"], cfg["num_count"]
    # The Views AJAX needs the page's current view_dom_id — read it live so we don't
    # depend on a hash that can change between site builds.
    page = requests.get(f"{IDAHO_BASE}/games/winning-numbers",
                        headers={"User-Agent": USER_AGENT}, timeout=30).text
    dm = re.search(r'"view_dom_id":"([0-9a-f]+)"', page)
    params = {
        "view_name": "games", "view_display_id": "winning_numbers", "view_args": "",
        "view_path": "/games/winning-numbers", "view_dom_id": dm.group(1) if dm else "",
        "pager_element": "0", "page": "0",
    }
    cmds = requests.get(f"{IDAHO_BASE}/views/ajax", params=params, timeout=30,
                        headers={"User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest"}).json()
    # Most Drupal AJAX commands carry HTML in a string `data`; some (e.g. settings)
    # carry a list/dict instead — keep only the string ones so the join can't blow up.
    html = " ".join(c["data"] for c in cmds
                    if isinstance(c, dict) and isinstance(c.get("data"), str))
    newest = None
    for rm in re.finditer(r"(?s)<tr[^>]*>(.*?)</tr>", html):
        row = rm.group(1)
        if label not in row:
            continue
        cells = {cm.group(1): cm.group(2)
                 for cm in re.finditer(r'(?s)<td[^>]*data-title="([^"]+)"[^>]*>(.*?)</td>', row)}
        dmatch = re.search(r"(\d\d)/(\d\d)/(\d\d)", re.sub(r"<[^>]+>", " ", cells.get("Date", "")))
        if not dmatch:
            continue  # the undated "latest" row is captured on the next run, once dated
        date = f"20{dmatch.group(3)}-{dmatch.group(1)}-{dmatch.group(2)}"
        wn = cells.get("Winning Numbers", "")
        if cfg.get("digits"):
            # twice-daily digit game (Pick 3/4): each row has a Day and a Night
            # <ul> — keep the night draw (the latest of the day).
            night = re.search(r'(?s)<ul[^>]*\bnight"[^>]*>(.*?)</ul>', wn)
            wn = night.group(1) if night else wn
        nums = [int(x) for x in re.findall(r"<li>\s*(\d{1,2})\s*</li>", wn)]
        if len(nums) < n:
            continue
        draw = {"date": date, "numbers": nums[:n]}
        if not cfg.get("digits"):  # digit games' "$500/$5,000" is a fixed prize, not a jackpot
            jm = re.search(r"\$([\d,]+)", cells.get("Jackpot", ""))
            if jm:
                draw["jackpot"] = int(jm.group(1).replace(",", ""))
        prev = by_date.get(date)
        if prev and prev.get("jackpot") and not draw.get("jackpot"):
            draw["jackpot"] = prev["jackpot"]
        by_date[date] = draw
        if newest is None or date > newest["date"]:
            newest = draw
    if not newest or not newest.get("jackpot"):
        return None
    nxt = (datetime.fromisoformat(newest["date"]) + timedelta(days=1)).date().isoformat()
    return {"date": nxt, "jackpot": newest["jackpot"], "cash": newest["jackpot"]}


PA_DRAWINGS = "https://www.palottery.pa.gov/Custom/uploadedfiles/hmnew/Drawings.ashx"


def scrape_pa(cfg, by_date):
    """Pennsylvania: the palottery.pa.gov Drawings.ashx JSON handler returns a game's
    full draw history for a date range in one call. We keep the Pick digits (dropping
    the optional Wild Ball add-on, which is the trailing number). Dates are .NET
    /Date(ms)/. Mutates by_date; only adds/updates (aged-out draws are retained)."""
    g, n = cfg["pa_game"], cfg["num_count"]
    today = date.today()
    params = {"mode": "search", "d1": "01/01/2000",
              "d2": today.strftime("%m/%d/%Y"), "nums": "", "g": str(g)}
    txt = requests.get(PA_DRAWINGS, params=params, timeout=90,
                       headers={"User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest"}).text
    for rec in txt.split("},{"):
        dm = re.search(r'"drawingNumberDate":"[^"]*?(\d{10,})', rec)
        if not dm:
            continue
        d = datetime.fromtimestamp(int(dm.group(1)) / 1000, timezone.utc).date().isoformat()
        nums = []
        for i in range(1, n + 1):
            m = re.search(rf'"drawingNumber{i}":(\d+)', rec)
            if m:
                nums.append(int(m.group(1)))
        if len(nums) >= n:
            by_date[d] = {"date": d, "numbers": nums}
    return None


FL_API = "https://apim-website-prod-eastus.azure-api.net/drawgamesapp/searchgames"
FL_HEADERS = {"Origin": "https://floridalottery.com", "Referer": "https://floridalottery.com/",
              "x-partner": "web", "accept": "application/json", "User-Agent": USER_AGENT}


def scrape_florida(cfg, by_date):
    """Florida: the floridalottery.com Azure API (drawgamesapp/searchgames) returns a
    game's full history for a date range — numbers + the upcoming jackpot — in one
    JSON call. No subscription key; just the Origin/x-partner headers a browser sends.
    Mutates by_date (add/update only — aged-out draws retained); returns the jackpot."""
    n = cfg["num_count"]
    keep_type = cfg.get("fl_draw_type")     # multi-draw/day games -> keep this DrawType (Picks "EVENING", Cash Pop "EVE")
    digits = cfg.get("digits")              # digit games keep draw order; ball games sort
    sk, st = cfg.get("special_key"), cfg.get("special_type")  # e.g. Cash4Life cash ball ("cb")
    # The API 500s on huge ranges (Pick 3/4 have big records). Such games fetch a
    # recent window each run; retention keeps the deeper backfilled history.
    win = cfg.get("fl_window_years")
    start = ((date.today() - timedelta(days=365 * win + 30)).strftime("%d-%b-%Y").upper()
             if win else "1-JAN-1988")
    params = {"id": cfg["fl_id"], "startDate": start,
              "endDate": date.today().strftime("%d-%b-%Y").upper()}
    # The Pick games emit invalid JSON when the Fireball is empty ("NumberPick": ,) —
    # sanitize before parsing. We only read wn1..wnN, so a null Fireball is harmless.
    txt = requests.get(FL_API, params=params, headers=FL_HEADERS, timeout=120).text
    data = json.loads(re.sub(r'"NumberPick":\s*,', '"NumberPick": null,', txt))
    jackpot = None
    for r in data:
        if keep_type and r.get("DrawType") not in (None, "", keep_type):
            continue
        try:
            d = datetime.strptime(r["DrawDate"].split(" ")[0], "%m/%d/%Y").date().isoformat()
        except (KeyError, ValueError):
            continue
        nums = []
        for t in range(1, n + 1):
            nt = "wn" if cfg.get("single_wn") else f"wn{t}"  # Cash Pop's lone number is "wn"
            cell = next((x for x in r.get("DrawNumbers", []) if x.get("NumberType") == nt), None)
            if cell is not None:
                nums.append(int(cell["NumberPick"]))
        if len(nums) < n:
            continue
        draw = {"date": d, "numbers": nums if digits else sorted(nums)}
        if sk and st:
            sc = next((x for x in r.get("DrawNumbers", []) if x.get("NumberType") == st), None)
            if sc is not None:
                draw[sk] = int(sc["NumberPick"])
        by_date[d] = draw
        if jackpot is None:
            m = re.search(r"\$\s*([0-9.]+)\s*(Million|Billion)?", r.get("NextJackpotAmount", ""))
            if m:
                amt = float(m.group(1)) * (1e9 if m.group(2) == "Billion"
                                           else 1e6 if m.group(2) == "Million" else 1)
                try:
                    jd = datetime.strptime(r.get("NextJackpotDate", "").split(" ")[0], "%m/%d/%Y").date().isoformat()
                except ValueError:
                    jd = None
                jackpot = {"date": jd, "jackpot": int(amt)}
                if cfg.get("fl_tiers"):
                    jackpot["cash"] = int(amt)  # FL doesn't publish a cash option
    if cfg.get("fl_tiers"):
        enrich_florida_tiers(cfg, by_date)
    return jackpot


FL_TIERS = "https://apim-website-prod-eastus.azure-api.net/drawgamesapp/getDrawGameTiersHistory"


def _fl_amt(s):
    # amounts come as "$6,000.00", "$3.50 Million", or bare "555"/"18.5" (Fantasy 5)
    m = re.search(r"([0-9.,]+)\s*Million", s)
    if m:
        return int(float(m.group(1).replace(",", "")) * 1e6)
    m = re.search(r"([0-9.,]+)", s)
    return int(float(m.group(1).replace(",", ""))) if m else None


def enrich_florida_tiers(cfg, by_date):
    """Merge per-tier prizes + winner counts (FL getDrawGameTiersHistory) into draws.
    PrizeLevels look like "5-of-6_2x" — the 2x-10x multiplier sub-tiers are aggregated to
    Match N (winner-weighted average prize). The full match is "Jackpot" for jackpot games
    or "Match N" otherwise (Fantasy 5); a "Free Ticket" tier stays free. Recent window."""
    n = cfg["num_count"]
    top_jp = cfg.get("fl_top_jackpot", True)
    keep_type = cfg.get("fl_draw_type")  # twice-daily (Fantasy 5) -> match the evening tiers
    win = cfg.get("fl_tiers_years", 2)
    start = (date.today() - timedelta(days=365 * win + 30)).strftime("%d-%b-%Y").upper()
    params = {"id": cfg["fl_id"], "startDate": start,
              "endDate": date.today().strftime("%d-%b-%Y").upper()}
    try:
        data = requests.get(FL_TIERS, params=params, headers=FL_HEADERS, timeout=90).json()
    except Exception as exc:
        print(f"  ! FL tiers fetch failed ({exc})")
        return
    enriched = 0
    for r in data:
        if keep_type and r.get("DrawType") not in (None, "", keep_type):
            continue
        try:
            d = datetime.strptime(r["DrawDate"].split(" ")[0], "%m/%d/%Y").date().isoformat()
        except (KeyError, ValueError):
            continue
        if d not in by_date:
            continue
        agg = {}
        for tier in r.get("Tiers", []):
            mm = re.match(r"(\d+)-of-\d+", str(tier.get("PrizeLevel", "")).split("_")[0])
            if not mm:
                continue
            matched = int(mm.group(1))
            lvl = "Jackpot" if (top_jp and matched == n) else f"Match {matched}"
            a = agg.setdefault(lvl, {"matched": matched, "winners": 0, "sum": 0.0, "free": False, "jp": None})
            w = int(tier.get("Winners") or 0)
            a["winners"] += w
            amt_s = str(tier.get("PrizeAmount", ""))
            if "free" in amt_s.lower():
                a["free"] = True
            elif lvl == "Jackpot":
                a["jp"] = _fl_amt(amt_s)
            else:
                v = _fl_amt(amt_s)
                if v:
                    a["sum"] += v * w
        prizes, tot, jp_amt = [], 0, None
        for lvl, a in sorted(agg.items(), key=lambda kv: -kv[1]["matched"]):
            tot += a["winners"]
            if a["free"]:
                prizes.append({"level": lvl, "amount": "Free Ticket", "winners": a["winners"]})
            elif lvl == "Jackpot":
                jp_amt = a["jp"]
                prizes.append({"level": lvl, "amount": a["jp"], "winners": a["winners"]})
            else:
                avg = int(a["sum"] / a["winners"]) if a["winners"] else 0
                prizes.append({"level": lvl, "amount": avg, "winners": a["winners"]})
        if prizes:
            by_date[d]["prizes"] = prizes
            by_date[d]["total_winners"] = tot
            # The 6-of-6 tier carries the advertised jackpot for that draw (even with 0
            # winners) -> expose it as the per-draw jackpot so the history saw-tooth renders.
            if jp_amt:
                by_date[d]["jackpot"] = jp_amt
            enriched += 1
    print(f"  enriched {enriched} draw(s) with per-tier prizes (FL tiers API)")


def scrape_texas_html(cfg, by_date):
    """Texas games with no CSV — parse the results HTML table. Digit games (Pick 3,
    Daily 4) have all four daily draws in one row; we keep the latest non-empty one
    per date. Keno (All or Nothing) has one row per draw; we keep a recent window."""
    base = f"{TX_GAMES_BASE}/{cfg['game_path']}/Winning_Numbers"
    page = requests.get(f"{base}/index.html", headers={"User-Agent": USER_AGENT}, timeout=40).text
    rows = re.findall(r"(?s)<tr[^>]*>(.*?)</tr>", page)
    n = cfg["num_count"]

    def cells_of(row):
        return [re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                for c in re.findall(r"(?s)<td[^>]*>(.*?)</td>", row)]

    if cfg.get("keno"):
        rank = {"Morning": 1, "Day": 2, "Evening": 3, "Night": 4}
        recs = []
        for row in rows:
            cells = cells_of(row)
            if len(cells) < 4 or not re.match(r"^\d{2}/\d{2}/\d{4}$", cells[0]):
                continue
            mo, dy, yr = cells[0].split("/")
            nums = [int(x) for x in re.findall(r"\d+", cells[2])][:n]
            if len(nums) < n:
                continue
            w = re.sub(r"\D", "", cells[3])
            recs.append((f"{yr}-{mo}-{dy}", rank.get(cells[1], 0), cells[1],
                         sorted(nums), int(w) if w else 0))
        recs.sort(key=lambda x: (x[0], x[1]))
        by_date.clear()
        for i, (d, _, time, nums, w) in enumerate(recs[-cfg.get("cap", 600):]):
            by_date[f"{d}#{i}"] = {"date": d, "numbers": nums, "draw_time": time,
                                   "top_prize_winners": w, "draw_number": i}
    else:
        for row in rows:
            cells = cells_of(row)
            if len(cells) < 9 or not re.match(r"^\d{2}/\d{2}/\d{4}$", cells[0]):
                continue
            mo, dy, yr = cells[0].split("/")
            nums_cell = next((cells[i] for i in (7, 5, 3, 1) if re.search(r"\d", cells[i])), "")
            digits = [int(x) for x in re.findall(r"\d", nums_cell)]
            if len(digits) < n:
                continue
            by_date[f"{yr}-{mo}-{dy}"] = {"date": f"{yr}-{mo}-{dy}", "numbers": digits[:n]}
    return None


WA_DRAWINGS = "https://www.walottery.com/WinningNumbers/PastDrawings.aspx"


def _wa_date(s):
    try:
        return datetime.strptime(s.strip(), "%a, %b %d, %Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def scrape_walottery(cfg, by_date):
    """Washington's Lottery PastDrawings.aspx — server-rendered HTML tables.

    Each draw block: date in <p class="h2-like">, balls in <li>, and (for Lotto,
    Hit 5, Match 4, Cash Pop) a per-tier prize table with columns Prize Level /
    Prize Amount / WA Winners / Total. The page renders every draw twice (mobile +
    desktop viewport), so keying by date dedupes. One page per year via
    ?gamename=&unittype=year&unitcount=YYYY. CI fetches the recent two years; the
    committed backfill + retention keep the deeper history."""
    name = cfg["wa_name"]
    n = cfg["num_count"]
    this_year = date.today().year
    years = cfg.get("years") or range(this_year - 1, this_year + 1)
    date_rx = re.compile(r'<p class="h2-like">\s*([^<]+?)\s*</p>')
    li_rx = re.compile(r"<li>\s*(\d+)\s*</li>")
    cell_rx = re.compile(r"(?s)<td>\s*(.*?)\s*</td>")
    body_rx = re.compile(r"(?s)WA Winners.*?<tbody>(.*?)</tbody>")
    for yr in years:
        url = f"{WA_DRAWINGS}?gamename={name}&unittype=year&unitcount={yr}"
        try:
            page = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=40).text
        except Exception as exc:
            print(f"  ! {name} {yr}: {exc}")
            continue
        marks = list(date_rx.finditer(page))
        for i, m in enumerate(marks):
            iso = _wa_date(m.group(1))
            if not iso:
                continue
            end = marks[i + 1].start() if i + 1 < len(marks) else len(page)
            seg = page[m.start():end]
            balls = [int(x) for x in li_rx.findall(seg)]
            if len(balls) < n:
                continue
            draw = {"date": iso, "numbers": balls[:n]}
            if cfg.get("prizes"):
                bm = body_rx.search(seg)
                if bm:
                    cells = [re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                             for c in cell_rx.findall(bm.group(1))]
                    prizes = []
                    for j in range(0, len(cells) - 3, 4):
                        lvl = cells[j]
                        if not lvl or "Total" in lvl:
                            continue
                        amt_txt = cells[j + 1]
                        am = re.search(r"\$([\d,]+)", amt_txt)
                        row = {"level": lvl, "label": lvl,
                               "amount": int(am.group(1).replace(",", "")) if am else 0,
                               "winners": int(re.sub(r"\D", "", cells[j + 2]) or 0)}
                        if re.search(r"free|ticket", amt_txt, re.IGNORECASE):
                            row["free"] = True
                        prizes.append(row)
                    if prizes:
                        draw["prizes"] = prizes
                        draw["total_winners"] = sum(p["winners"] for p in prizes)
                        # Top tier is the (rolling) jackpot/cashpot — surface it as a
                        # per-draw jackpot so the history page plots the saw-tooth.
                        if cfg.get("jackpot_top") and prizes[0]["amount"]:
                            draw["jackpot"] = prizes[0]["amount"]
            by_date[iso] = draw
    cap = cfg.get("cap")
    if cap and len(by_date) > cap:
        for k in sorted(by_date)[:-cap]:
            del by_date[k]
    return None


OHIO_ARCHIVE = "https://www.ohiolottery.com/winning-numbers/check-your-numbers/winning-numbers-archive"


def scrape_ohio_cms(cfg, by_date):
    """Ohio Lottery — the archive page embeds recent draws server-side as a JSON blob
    (id="cmsNumbers"): winning numbers, per-tier prizes + WA-style winner counts, the
    prize pool (jackpot), and the NEXT jackpot/cash value. Only the latest draw(s) per
    game are present, so retention accumulates the history; the per-year CSV export
    seeds the deeper backfill."""
    def num(v):
        try:
            return int(round(float(v)))
        except (TypeError, ValueError):
            return 0

    page = requests.get(OHIO_ARCHIVE, headers={"User-Agent": USER_AGENT}, timeout=40).text
    m = re.search(r"id=\"cmsNumbers\"\s+value='([^']*)'", page)
    if not m:
        return None
    games = json.loads(unescape(m.group(1)))
    game = next((g for g in games if g.get("NodeAliasPath") == cfg["oh_path"]), None)
    if not game:
        return None
    n = cfg["num_count"]
    draws = game.get("Draws") or []
    for dr in draws:
        d = (dr.get("DrawDate") or "")[:10]
        if not d:
            continue
        # Kicker is the 6-digit add-on carried as ExtendedNumbers on Classic Lotto draws.
        src = "ExtendedNumbers" if cfg.get("extended") else "Numbers"
        nums_all = [x["Value"] for x in sorted(dr.get(src) or [], key=lambda z: z.get("Position", 0))]
        if len(nums_all) < n:
            continue
        main = sorted(nums_all[:n]) if cfg.get("sort") else nums_all[:n]
        draw = {"date": d, "numbers": main}
        sp = cfg.get("special_key")
        if sp and len(nums_all) > n:
            draw[sp] = nums_all[n]  # the ball after the n main numbers (Bonus/Lucky)
        # ExtendedNumbers games (Kicker) don't carry their own prize table here.
        prizes = [] if cfg.get("extended") else [
                  {"level": re.sub(r"\s+", " ", p["Description"]).strip(),
                   "label": re.sub(r"\s+", " ", p["Description"]).strip(),
                   "amount": num(p.get("Payout")), "winners": num(p.get("WinnersNumber"))}
                  for p in (dr.get("Prizes") or []) if p.get("Description")]
        if prizes:
            draw["prizes"] = prizes
            draw["total_winners"] = sum(p["winners"] for p in prizes)
        if cfg.get("jackpot"):
            jp = num(dr.get("PrizePool"))
            if jp:
                draw["jackpot"] = jp
            cash = num(dr.get("PDCV"))
            if cash:
                draw["cash"] = cash
        by_date[d] = draw
    # Current/next jackpot from the newest draw's Next* fields. The per-draw
    # NextDrawDate is sometimes the .NET epoch (0001-…) before the site schedules it;
    # fall back to the game-level NextDrawDate, else leave it unset.
    if cfg.get("jackpot") and draws:
        newest = max(draws, key=lambda z: z.get("DrawDate", ""))
        nj = num(newest.get("NextPrizePool"))
        if nj:
            nd = None
            for cand in (newest.get("NextDrawDate"), game.get("NextDrawDate")):
                if cand and not str(cand).startswith("0001"):
                    nd = str(cand)[:10]
                    break
            return {"date": nd, "jackpot": nj, "cash": num(newest.get("NextPDCV")) or None}
    return None


MI_API = "https://www.michiganlottery.com/api/v1/draw-games"
MI_GAME_QUERY = (
    "query Game($gameCode: String!, $startDateString: String!, $endDateString: String!) {"
    " gameByCode(code: $gameCode) { logicalGameIdentifier"
    " drawResultsBetweenDates(startDateString: $startDateString, endDateString: $endDateString) {"
    " drawDate drawSequence isBonusDraw hasPayoutData"
    " winningNumbers { drawNumbers luckyball millionaireball } } } }"
)
MI_PAYOUT_QUERY = (
    "query Payout($logicalGameIdentifier: String, $drawDate: String) {"
    " payout(logicalGameIdentifier: $logicalGameIdentifier, drawDate: $drawDate) {"
    " payoutMid { prizeLevel winnerCount prizeAmount description }"
    " payoutEve { prizeLevel winnerCount prizeAmount description } } }"
)
MI_JACKPOT_QUERY = (
    "query J($logicalGameIdentifier: String) {"
    " jackpot: currentEstimatedJackpotForGame(logicalGameIdentifier: $logicalGameIdentifier) { jackpot }"
    " next: nextDrawTimeForLogicalGame(logicalGameIdentifier: $logicalGameIdentifier) { date } }"
)


def _mi_post(query, variables):
    """Michigan's Apollo GraphQL gateway. The apollo-require-preflight header clears
    its CSRF block; queries are sent as plain POST bodies (no persisted-query hash)."""
    r = requests.post(MI_API, json={"query": query, "variables": variables},
                      headers={"User-Agent": USER_AGENT, "apollo-require-preflight": "true",
                               "content-type": "application/json"}, timeout=45)
    return (r.json() or {}).get("data") or {}


def scrape_michigan(cfg, by_date):
    """michiganlottery.com GraphQL API (reverse-engineered from the app bundle).
    drawResultsBetweenDates gives full history by date range; the payout query gives
    per-tier prizes + winner counts; currentEstimatedJackpotForGame gives the live
    jackpot. CI pulls the recent year(s); local backfill widens start_year."""
    code, n = cfg["mi_code"], cfg["num_count"]
    sp, sp_field = cfg.get("special_key"), cfg.get("mi_special_field")
    seq = cfg.get("mi_seq")  # keep only this drawSequence (Lotto 47 main = 1, Double Play = 2)
    this_year = date.today().year
    start_year = cfg.get("start_year", this_year - 1)
    logical = None
    for yr in range(start_year, this_year + 1):
        data = _mi_post(MI_GAME_QUERY, {"gameCode": code,
                        "startDateString": f"{yr}-01-01T00:00:00.000Z",
                        "endDateString": f"{yr + 1}-01-01T00:00:00.000Z"})
        gbc = data.get("gameByCode") or {}
        logical = gbc.get("logicalGameIdentifier") or logical
        for dr in gbc.get("drawResultsBetweenDates") or []:
            if seq and dr.get("drawSequence") != seq:
                continue
            d = (dr.get("drawDate") or "")[:10]
            wn = dr.get("winningNumbers") or {}
            nums = wn.get("drawNumbers") or []
            if not d or len(nums) < n:
                continue
            draw = {"date": d, "numbers": sorted(nums[:n]) if cfg.get("sort") else nums[:n]}
            if sp and wn.get(sp_field) is not None:
                draw[sp] = wn[sp_field]
            by_date[d] = draw
    # Per-tier prizes for the most recent draws that should carry them.
    if cfg.get("prizes") and logical:
        slot = "payoutEve" if cfg.get("mi_payout", "eve") == "eve" else "payoutMid"
        recent = sorted((d for d in by_date if not by_date[d].get("prizes")), reverse=True)
        for d in recent[:cfg.get("prizes_cap", 30)]:
            try:
                pdata = _mi_post(MI_PAYOUT_QUERY, {"logicalGameIdentifier": logical, "drawDate": d})
                rows = ((pdata.get("payout") or {}).get(slot)) or []
            except Exception:
                continue
            prizes = []
            for r in rows:
                if r.get("prizeLevel") is None:
                    continue
                desc = (r.get("description") or "").strip()
                if re.search(r"\(\$0\.50?\)", desc):
                    continue  # keep the $1 plays only (some games list $0.50 + $1.00 rows)
                label = re.sub(r"\s*\(\$[\d.]+\)\s*", "", desc) or f"Level {r['prizeLevel']}"
                prizes.append({"level": label, "label": label,
                               "amount": _int(r.get("prizeAmount")) // 100,  # cents
                               "winners": _int(r.get("winnerCount"))})
            if prizes:
                by_date[d]["prizes"] = prizes
                by_date[d]["total_winners"] = sum(p["winners"] for p in prizes)
            time.sleep(0.2)
    # Current/next jackpot.
    cur = None
    if cfg.get("jackpot") and logical:
        try:
            jd = _mi_post(MI_JACKPOT_QUERY, {"logicalGameIdentifier": logical})
            jp = _int((jd.get("jackpot") or {}).get("jackpot")) // 100  # API amount is in cents
            nd = ((jd.get("next") or {}).get("date") or "")[:10] or None
            if jp:
                cur = {"date": nd, "jackpot": jp}
                if cfg.get("jackpot_is_cash"):
                    cur["cash"] = jp  # Fantasy 5 jackpot is a cash prize
        except Exception:
            pass
    return cur


GAMBYT_BASE = "https://prod.game-data.gambytservices.com"


def scrape_gambyt(cfg, by_date):
    """NeoPollard / Gambyt game-data-service (used by NH, MI, VA, NC, … ilotteries).
    Each state exposes a public X-API-Key in its web bundle. list-drawings returns the
    winning numbers, bonus ball, and progressive jackpot (in cents) in 90-day windows.
    CI pulls the recent window; the committed backfill + retention keep deeper history."""
    n = cfg["num_count"]
    gid = cfg["gambyt_id"]
    headers = {"X-API-Key": cfg["gambyt_key"], "X-Client-ID": cfg.get("gambyt_client", "nh-portal-server"),
               "User-Agent": USER_AGENT}
    today = date.today()
    cur = date(today.year - 1, 1, 1)  # CI: the recent ~1.5 years
    while cur <= today:
        end = min(cur + timedelta(days=90), today + timedelta(days=1))
        try:
            rows = requests.get(f"{GAMBYT_BASE}/v1/draw-games/{gid}/list-drawings",
                                params={"startDate": cur.isoformat(), "endDate": end.isoformat()},
                                headers=headers, timeout=40).json()
        except Exception as exc:
            print(f"  ! {cfg['gambyt_id'][:8]} {cur}: {exc}")
            rows = []
        for dr in rows or []:
            when = dr.get("when") or {}
            if cfg.get("evening") and when.get("label") != "Evening":
                continue
            dt = (when.get("drawTime") or "")[:10]
            res = (((dr.get("results") or {}).get("drawResult") or {}).get("primary")) or {}
            nums = res.get("winningNumbers") or []
            if not dt or len(nums) < n:
                continue
            draw = {"date": dt, "numbers": sorted(nums[:n]) if cfg.get("sort") else nums[:n]}
            sp = cfg.get("special_key")
            if sp and res.get("bonusNumbers"):
                draw[sp] = res["bonusNumbers"][0]
            if cfg.get("jackpot"):
                pj = dr.get("progressiveJackpot") or {}
                if pj.get("status") == "ACTIVE":
                    jp = _int((pj.get("jackpot") or {}).get("jackpotAmountInCents")) // 100
                    if jp:
                        draw["jackpot"] = jp
            by_date[dt] = draw
        cur = end
    return None


def scrape_va(cfg, by_date):
    """Virginia Lottery — game pages (valottery.com/Data/Draw-Games/<game>) server-render
    the latest draw in a card band. Deep history comes from the manual "All Past Numbers"
    TXT exports; this keeps the latest draw current. Pick 3/4 show Day + Night — we track
    Night (the 'evening' list); the trailing li in a Pick list is the FIREBALL (dropped)."""
    page = requests.get(f"https://www.valottery.com/Data/Draw-Games/{cfg['va_path']}",
                        headers={"User-Agent": USER_AGENT}, timeout=40).text
    m = re.search(rf'href="/Data/Draw-Games/{cfg["va_card"]}"', page)
    if not m:
        return None
    seg = page[m.start():m.start() + 3800]
    dm = re.search(r"Latest Drawing:\s*[A-Za-z]{3}\s*(\d{1,2})/(\d{1,2})/(\d{4})", seg)
    if not dm:
        return None
    iso = f"{dm.group(3)}-{int(dm.group(1)):02d}-{int(dm.group(2)):02d}"
    n = cfg["num_count"]
    sm = (re.search(r'(?s)ul class="evening".*?</ul>', seg) if cfg.get("evening")
          else re.search(r'(?s)selected-numbers".*?</ul>', seg))
    if not sm:
        return None
    nums = [int(x) for x in re.findall(r"<li>(\d+)</li>", sm.group(0))]
    if len(nums) < n:
        return None
    draw = {"date": iso, "numbers": sorted(nums[:n]) if cfg.get("sort") else nums[:n]}
    if cfg.get("special_key") and len(nums) > n:
        draw[cfg["special_key"]] = nums[n]  # Bank a Million: the 7th li is the Bonus Ball
    by_date[iso] = draw
    return None


def scrape_nc(cfg, by_date):
    """North Carolina Education Lottery — per-game CSV exports (nclottery.com/<game>-download).
    Server-fetchable, full history. Pick 3/4 are twice daily (Day/Eve); we track the evening."""
    txt = requests.get(f"https://nclottery.com/{cfg['nc_url']}-download",
                       headers={"User-Agent": USER_AGENT}, timeout=45).text
    n, bs = cfg["num_count"], cfg.get("ball_start", 1)
    for line in txt.splitlines():
        if not re.match(r'^"\d{2}/\d{2}/\d{4}"', line):
            continue
        cells = re.findall(r'"([^"]*)"', line)
        mo, dy, yr = cells[0].split("/")
        iso = f"{yr}-{mo}-{dy}"
        if cfg.get("evening") and (len(cells) < 2 or cells[1] != "E"):
            continue
        nums = [int(cells[bs + k]) for k in range(n)
                if bs + k < len(cells) and cells[bs + k].isdigit()]
        if len(nums) < n:
            continue
        by_date[iso] = {"date": iso, "numbers": sorted(nums) if cfg.get("sort") else nums}
    return None


MA_BASE = "https://www.masslottery.com/api"


def _ma_get(path, params=None):
    r = requests.get(f"{MA_BASE}{path}", params=params, timeout=45,
                     headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    r.raise_for_status()
    return r.json()


def scrape_massachusetts(cfg, by_date):
    """masslottery.com public API (reverse-engineered from the SPA bundle).
    /v1/draw-results/{game}?draw_date_min&max returns history by date window — the
    server 500s on large spans, so we chunk (~90 days) with one retry. /v3/game-payouts
    /{game}?draw_number gives per-tier prizes (dollars) + winner counts for jackpot games.
    /v1/draw-results estimatedJackpot carries the live jackpot + cash option. Twice-daily
    games (Mass Cash, Numbers) keep the later (higher drawNumber) draw per date. CI pulls
    the recent window; retention keeps the deep backfill."""
    g, n = cfg["ma_game"], cfg["num_count"]
    today = date.today()
    start = date(cfg.get("start_year", today.year - 1), 1, 1)
    win = timedelta(days=cfg.get("ma_window_days", 90))
    seen = {}  # date -> drawNumber kept, so the evening draw wins for twice-daily games

    def fetch_window(a, b):
        try:
            return _ma_get(f"/v1/draw-results/{g}",
                           {"draw_date_min": a.strftime("%m/%d/%Y"),
                            "draw_date_max": b.strftime("%m/%d/%Y")}).get("winningNumbers") or []
        except Exception:
            if (b - a).days > 20:  # flaky 500 on a span — split once and retry the halves
                mid = a + (b - a) // 2
                return fetch_window(a, mid) + fetch_window(mid + timedelta(days=1), b)
            return []

    cur = start
    while cur <= today:
        end = min(cur + win, today)
        for dr in fetch_window(cur, end):
            if dr.get("gameIdentifier") != g:
                continue
            d = (dr.get("drawDate") or "")[:10]
            nums = dr.get("winningNumbers") or []
            if not d or len(nums) < n:
                continue
            dn = _int(dr.get("drawNumber"))
            if d in seen and seen[d] >= dn:
                continue  # already have the later draw of this date
            seen[d] = dn
            by_date[d] = {"date": d, "draw_number": dn,
                          "numbers": sorted(nums[:n]) if cfg.get("sort") else nums[:n]}
        cur = end + timedelta(days=1)

    # Per-tier prizes + winners for the most recent draws (jackpot games only).
    if cfg.get("prizes"):
        recent = sorted((d for d in by_date if not by_date[d].get("prizes")), reverse=True)
        for d in recent[:cfg.get("prizes_cap", 30)]:
            dn = by_date[d].get("draw_number")
            if not dn:
                continue
            try:
                rows = _ma_get(f"/v3/game-payouts/{g}", {"draw_number": dn}).get("payouts") or []
            except Exception:
                continue
            prizes, jp_amt = [], None
            for r in rows:
                desc = (r.get("prizeDescription") or r.get("prizeLevel") or "").strip()
                # The value engine keys the top tier on the literal "Jackpot" so it uses the
                # cash option, not the annuity amount in this row. Keep the label for display.
                is_jp = (r.get("prizeLevel") or "").strip().lower() == "jackpot"
                level = "Jackpot" if is_jp else desc
                amt = _int(r.get("prizeAmount"))  # already in dollars
                if is_jp:
                    jp_amt = amt  # advertised annuity jackpot for this draw -> saw-tooth chart
                w = r.get("winners")
                prizes.append({"level": level, "label": desc or level,
                               "amount": amt, "winners": _int(w) if w is not None else None})
            if prizes:
                by_date[d]["prizes"] = prizes
                if jp_amt:
                    by_date[d]["jackpot"] = jp_amt
                if all(p["winners"] is not None for p in prizes):
                    by_date[d]["total_winners"] = sum(p["winners"] for p in prizes)
            time.sleep(0.2)

    # Live jackpot + cash option (progressive games).
    cur_jp = None
    if cfg.get("jackpot"):
        try:
            snap = _ma_get("/v1/draw-results", {"product_ids": cfg["ma_product_id"]})
            for ej in (snap.get("estimatedJackpot") or []):
                if ej.get("gameIdentifier") == g:
                    jp = _int(ej.get("estimatedJackpotUSD"))
                    cash = _int(ej.get("estimatedCashOptionUSD"))
                    nd = (ej.get("drawDateFor") or "")[:10] or None
                    if jp:
                        cur_jp = {"date": nd, "jackpot": jp, "cash": cash or None}
                    break
        except Exception:
            pass
    return cur_jp


MD_WN = "https://www.mdlottery.com/player-tools/winning-numbers/"


def scrape_maryland(cfg, by_date):
    """Maryland — the mdlottery.com "Winning Numbers" page server-renders a condensed
    table per game (Date + balls; Pick 3/4/5 share one Midday/Evening table). It exposes
    only a recent window (Multi-Match ~50, Bonus Match 5 ~180, …), so retention accumulates
    the deeper history. Multi-Match's live jackpot comes from its own game page.
    Mutates by_date; returns the upcoming jackpot for jackpot games."""
    page = requests.get(MD_WN, headers={"User-Agent": USER_AGENT}, timeout=45).text
    m = re.search(rf'winning-numbers table-condensed {re.escape(cfg["md_table"])}\b', page)
    if not m:
        return None
    tbl = page[m.start():page.index("</table>", m.start())]
    n, kind = cfg["num_count"], cfg["md_kind"]

    def iso_from(row):
        dm = re.search(r'class="date">(\d\d)/(\d\d)/(\d\d)', row)
        return f"20{dm.group(3)}-{dm.group(1)}-{dm.group(2)}" if dm else None

    if kind == "pick":
        # Combined Pick 3/4/5 table: one row per Midday/Evening; keep the evening draw,
        # read this game's own <ul class="pick-N"> (skip the "-" placeholder rows).
        pcls = cfg["md_pick_class"]
        for rm in re.finditer(r'(?s)<tr class="(mid|eve)">(.*?)</tr>', tbl):
            if rm.group(1) != "eve":
                continue
            row = rm.group(2)
            iso = iso_from(row)
            um = re.search(rf'(?s)<ul class="{pcls}">(.*?)</ul>', row)
            if not iso or not um:
                continue
            digits = re.findall(r"<li>(\d+)</li>", um.group(1))  # plain <li> = a digit; hidden are " + "
            if len(digits) < n:
                continue
            by_date[iso] = {"date": iso, "numbers": [int(x) for x in digits[:n]]}
    elif kind == "cashpop":
        for rm in re.finditer(r"(?s)<tr>(.*?)</tr>", tbl):
            row = rm.group(1)
            dr = re.search(r'class="drawing">#?(\d+)', row)
            nm = re.search(r'<ul class="balls"><li>(\d+)</li>', row)
            iso = iso_from(row)
            if not (dr and nm and iso):
                continue
            dn = int(dr.group(1))
            if iso in by_date and by_date[iso].get("draw_number", 0) >= dn:
                continue  # keep the latest drawing of the day
            by_date[iso] = {"date": iso, "draw_number": dn, "numbers": [int(nm.group(1))]}
    else:  # "balls" (Multi-Match) / "bonus" (Bonus Match 5)
        for rm in re.finditer(r"(?s)<tr>(.*?)</tr>", tbl):
            row = rm.group(1)
            iso = iso_from(row)
            um = re.search(r'(?s)<td class="numbers"><ul class="balls">(.*?)</ul>', row)
            if not iso or not um:
                continue
            nums = [int(x) for x in re.findall(r"<li>(\d+)</li>", um.group(1))]
            if len(nums) < n:
                continue
            draw = {"date": iso, "numbers": sorted(nums[:n]) if cfg.get("sort") else nums[:n]}
            if cfg.get("special_key"):
                bm = re.search(r'(?s)<td class="bonus">.*?<li[^>]*>(\d+)</li>', row)
                if bm:
                    draw[cfg["special_key"]] = int(bm.group(1))
            by_date[iso] = draw

    # Multi-Match jackpot from its game page ("$700 THOUSAND … Estimated Jackpot").
    if cfg.get("md_jackpot_path"):
        try:
            gp = requests.get(f"https://www.mdlottery.com/games/{cfg['md_jackpot_path']}/",
                              headers={"User-Agent": USER_AGENT}, timeout=30).text
            jm = re.search(r"\$\s*([\d.,]+)\s*(THOUSAND|MILLION|BILLION)?[\s\S]{0,80}?Estimated Jackpot", gp, re.I)
            if jm:
                mult = {"thousand": 1e3, "million": 1e6, "billion": 1e9}.get((jm.group(2) or "").lower(), 1)
                amt = int(float(jm.group(1).replace(",", "")) * mult)
                if amt:
                    return {"date": None, "jackpot": amt}
        except Exception:
            pass
    return None


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
        start = cfg.get("start")
        return {"game": game, "earliest_available": start.isoformat() if start else "", "draws": []}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True, choices=list(GAMES))
    ap.add_argument("--limit", type=int, default=0, help="max draws to fetch this run (0 = no cap)")
    ap.add_argument("--sleep", type=float, default=0.4, help="seconds between requests")
    args = ap.parse_args()

    cfg = GAMES[args.game]
    data = load_existing(args.game, cfg)
    by_date = {dr["date"]: dr for dr in data.get("draws", [])}
    prev_cur = data.get("current_jackpot")  # last run's upcoming-draw jackpot (for the saw-tooth forward-fill)

    if cfg["kind"] == "ny_socrata":
        added = scrape_socrata(cfg, by_date)
        print(f"[{args.game}] +{added} draw(s) from data.ny.gov; total {len(by_date)}.")
        source = "data.ny.gov + nylottery.ny.gov" if cfg.get("nyl_nid") else "data.ny.gov"
        complete = True
        if cfg.get("nyl_nid"):
            try:
                prizes = fetch_nyl_prizes(cfg["nyl_nid"], cfg.get("nyl_draw_time"))
            except Exception as exc:
                prizes = {}
                print(f"  ! nylottery prize feed failed ({exc})")
            enriched = 0
            for d in by_date.values():
                e = prizes.get(d["date"])
                if e:
                    d.update(e)
                    enriched += 1
            if enriched:
                print(f"  enriched {enriched} draw(s) with prizes/winners from nylottery.ny.gov")
        if cfg.get("nyl_key"):
            try:
                cur = fetch_nyl_current(cfg["nyl_key"])
            except Exception as exc:
                cur = None
                print(f"  ! nylottery jackpot fetch failed ({exc})")
            if cur:
                data["current_jackpot"] = cur
                print(f"  current jackpot {cur['date']}: ${cur['jackpot']:,} cash ${cur['cash'] or 0:,}")
    elif cfg["kind"] == "texas_csv":
        cur = scrape_texas(cfg, by_date)
        print(f"[{args.game}] {len(by_date)} draw(s) from texaslottery.com.")
        source = "texaslottery.com"
        complete = True
        if cur:
            data["current_jackpot"] = cur
            print(f"  current jackpot {cur['date']}: ${cur['jackpot']:,}")
    elif cfg["kind"] == "texas_html":
        scrape_texas_html(cfg, by_date)
        print(f"[{args.game}] {len(by_date)} draw(s) from texaslottery.com (HTML).")
        source = "texaslottery.com"
        complete = True
    elif cfg["kind"] == "calottery_api":
        cur = scrape_calottery(cfg, by_date)
        print(f"[{args.game}] {len(by_date)} draw(s) from calottery.com.")
        source = "calottery.com"
        complete = True
        if cur:
            data["current_jackpot"] = cur
            print(f"  current jackpot {cur['date']}: ${cur['jackpot']:,} cash ${cur.get('cash') or 0:,}")
    elif cfg["kind"] == "idaho_views_ajax":
        cur = scrape_idaho(cfg, by_date)
        print(f"[{args.game}] {len(by_date)} draw(s) from idaholottery.com.")
        source = "idaholottery.com"
        complete = True
        if cur:
            data["current_jackpot"] = cur
            print(f"  current jackpot {cur['date']}: ${cur['jackpot']:,}")
    elif cfg["kind"] == "pa_drawings":
        scrape_pa(cfg, by_date)
        print(f"[{args.game}] {len(by_date)} draw(s) from palottery.pa.gov.")
        source = "palottery.pa.gov"
        complete = True
    elif cfg["kind"] == "florida_api":
        cur = scrape_florida(cfg, by_date)
        print(f"[{args.game}] {len(by_date)} draw(s) from floridalottery.com.")
        source = "floridalottery.com"
        complete = True
        if cur:
            data["current_jackpot"] = cur
            print(f"  current jackpot {cur['date']}: ${cur['jackpot']:,}")
    elif cfg["kind"] == "walottery_html":
        scrape_walottery(cfg, by_date)
        print(f"[{args.game}] {len(by_date)} draw(s) from walottery.com.")
        source = "walottery.com"
        complete = True
    elif cfg["kind"] == "ohio_cms":
        cur = scrape_ohio_cms(cfg, by_date)
        print(f"[{args.game}] {len(by_date)} draw(s) from ohiolottery.com.")
        source = "ohiolottery.com"
        complete = True
        if cur:
            data["current_jackpot"] = cur
            print(f"  current jackpot {cur['date']}: ${cur['jackpot']:,} cash ${cur.get('cash') or 0:,}")
    elif cfg["kind"] == "michigan_graphql":
        cur = scrape_michigan(cfg, by_date)
        print(f"[{args.game}] {len(by_date)} draw(s) from michiganlottery.com.")
        source = "michiganlottery.com"
        complete = True
        if cur:
            data["current_jackpot"] = cur
            print(f"  current jackpot {cur.get('date')}: ${cur['jackpot']:,}")
    elif cfg["kind"] == "gambyt":
        scrape_gambyt(cfg, by_date)
        source = cfg.get("gambyt_source", "nhlottery.com")
        print(f"[{args.game}] {len(by_date)} draw(s) from {source}.")
        complete = True
    elif cfg["kind"] == "nc_csv":
        scrape_nc(cfg, by_date)
        source = "nclottery.com"
        print(f"[{args.game}] {len(by_date)} draw(s) from nclottery.com.")
        complete = True
    elif cfg["kind"] == "va_page":
        scrape_va(cfg, by_date)
        source = "valottery.com"
        print(f"[{args.game}] {len(by_date)} draw(s) from valottery.com.")
        complete = True
    elif cfg["kind"] == "masslottery_api":
        cur = scrape_massachusetts(cfg, by_date)
        source = "masslottery.com"
        print(f"[{args.game}] {len(by_date)} draw(s) from masslottery.com.")
        complete = True
        if cur:
            data["current_jackpot"] = cur
            print(f"  current jackpot {cur.get('date')}: ${cur['jackpot']:,} cash ${cur.get('cash') or 0:,}")
    elif cfg["kind"] == "mdlottery_html":
        cur = scrape_maryland(cfg, by_date)
        source = "mdlottery.com"
        print(f"[{args.game}] {len(by_date)} draw(s) from mdlottery.com.")
        complete = True
        if cur:
            data["current_jackpot"] = cur
            print(f"  current jackpot: ${cur['jackpot']:,}")
    else:
        scrape = SCRAPERS[cfg["kind"]]
        has_prizes = cfg["kind"] == "powerball_site"
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
        for d in missing:
            try:
                draw = scrape(d, cfg)
            except Exception as exc:
                print(f"  ! {d}: failed ({exc})")
                continue
            if draw:
                by_date[draw["date"]] = draw
                print(f"  + {d}: jackpot=${draw.get('jackpot') or 0:,} cash=${draw.get('cash_value') or 0:,}")
            time.sleep(args.sleep)
        source = "megamillions.com" if cfg["kind"] == "megamillions_api" else "powerball.com"
        last = max(by_date) if by_date else None
        complete = bool(by_date) and last is not None and not any(
            dd.isoformat() not in by_date
            for dd in draw_dates(cfg["start"], date.fromisoformat(last), cfg["draw_weekdays"])
        )

    # Saw-tooth forward-fill: sources that expose only the upcoming jackpot (Michigan,
    # Ohio Rolling Cash 5, …) don't carry historical per-draw jackpots. Once the draw the
    # prior run advertised actually lands, stamp that (official) amount onto it, so the
    # jackpot-over-time chart keeps accruing real points without a third-party feed.
    if prev_cur and prev_cur.get("date") in by_date and prev_cur.get("jackpot"):
        dd = by_date[prev_cur["date"]]
        if "jackpot" not in dd:
            dd["jackpot"] = prev_cur["jackpot"]

    # draw_number disambiguates multiple draws on the same date (Quick Draw).
    draws = sorted(by_date.values(), key=lambda x: (x["date"], x.get("draw_number", 0)))
    earliest = draws[0]["date"] if draws else (cfg["start"].isoformat() if cfg.get("start") else "")

    data.update({
        "game": args.game,
        "source": source,
        "earliest_available": earliest,
        "last_updated": date.today().isoformat(),
        "complete": complete,
        "draws": draws,
    })
    if cfg.get("retired"):
        data["retired"] = True
    if cfg.get("cap"):
        data["recent_window"] = True

    os.makedirs(HIST_DIR, exist_ok=True)
    with open(out_path(args.game), "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")

    print(f"[{args.game}] total {len(draws)}; wrote {os.path.abspath(out_path(args.game))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
