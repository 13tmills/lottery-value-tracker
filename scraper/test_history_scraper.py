#!/usr/bin/env python3
"""Tests for history_scraper's draw-date generation.

These exist because of a real, quiet failure: Powerball and Lotto America both
added a Monday draw partway through their history (2021-08-23 and 2022-07-18).
Generating Mondays before those dates produced 607 and 243 dates respectively
that the source can never serve. Because they were merged into one chronological
queue with the genuine repairs, every run spent hundreds of doomed requests on
them and never reached the two dozen recent draws whose prize breakdown was
actually missing - so the per-tier winner data silently stopped updating.
"""
from __future__ import annotations

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from history_scraper import GAMES, draw_dates  # noqa: E402

MON, WED, SAT = 0, 2, 5


def test_draw_dates_without_weekday_from_yields_every_weekday():
    got = list(draw_dates(date(2021, 8, 1), date(2021, 8, 31), {MON, WED, SAT}))
    assert date(2021, 8, 2) in got          # a Monday before the schedule change
    assert date(2021, 8, 30) in got
    assert all(d.weekday() in {MON, WED, SAT} for d in got)


def test_weekday_from_excludes_days_before_the_schedule_changed():
    got = list(draw_dates(date(2021, 8, 1), date(2021, 8, 31), {MON, WED, SAT},
                          {MON: date(2021, 8, 23)}))
    mondays = [d for d in got if d.weekday() == MON]
    assert mondays == [date(2021, 8, 23), date(2021, 8, 30)]
    # Wednesdays and Saturdays are untouched by a Monday-only rule.
    assert date(2021, 8, 4) in got
    assert date(2021, 8, 7) in got


def test_weekday_from_includes_the_boundary_date_itself():
    got = list(draw_dates(date(2021, 8, 23), date(2021, 8, 23), {MON},
                          {MON: date(2021, 8, 23)}))
    assert got == [date(2021, 8, 23)], "the day the draw was added must count"


def test_powerball_generates_no_monday_before_2021_08_23():
    cfg = GAMES["powerball"]
    got = list(draw_dates(cfg["start"], date(2021, 12, 31),
                          cfg["draw_weekdays"], cfg.get("weekday_from")))
    early = [d for d in got if d.weekday() == MON and d < date(2021, 8, 23)]
    assert early == [], f"{len(early)} Mondays generated that Powerball never drew"
    assert date(2021, 8, 23) in got


def test_lotto_america_generates_no_monday_before_2022_07_18():
    cfg = GAMES["lotto_america"]
    got = list(draw_dates(cfg["start"], date(2022, 12, 31),
                          cfg["draw_weekdays"], cfg.get("weekday_from")))
    early = [d for d in got if d.weekday() == MON and d < date(2022, 7, 18)]
    assert early == [], f"{len(early)} Mondays generated that Lotto America never drew"
    assert date(2022, 7, 18) in got


def test_monday_era_start_matches_a_real_monday():
    """A schedule-change date that isn't the weekday it gates would silently
    disable the whole rule."""
    for key in ("powerball", "lotto_america"):
        wf = GAMES[key].get("weekday_from") or {}
        for weekday, start in wf.items():
            assert start.weekday() == weekday, f"{key}: {start} is not weekday {weekday}"


def test_games_with_prizes_declare_a_prizes_from_date():
    """Anything parsed from powerball.com carries a per-tier breakdown, and the
    self-heal path needs to know from when to expect one."""
    for key, cfg in GAMES.items():
        if cfg.get("kind") == "powerball_site":
            assert isinstance(cfg.get("prizes_from"), date), f"{key} has no prizes_from"
            assert cfg["prizes_from"] >= cfg["start"]
