#!/usr/bin/env python3
"""NFL analytics ingest for NumbersIntel.

Pulls CC-BY 4.0 nflverse data via nflreadpy (the successor to nfl_data_py) and
writes compact, pre-computed static JSON to ../nfl/ for the frontend to read.
The site is static (GitHub Pages) — there is no DB or live API; these JSON files
ARE the "store" and the "endpoint". The frontend never calls nflverse directly.

LICENSING: uses ONLY the CC-BY 4.0 nflverse datasets (schedules, weekly player
stats, rosters, play-by-play). The FTN charting subset (CC-BY-SA 4.0) is NOT used
— its ShareAlike clause would force-license our own work. Attribution lives in the
NFL tab footer: "Data via nflverse (CC-BY 4.0)".

CONTENT: descriptive / historical metrics only. Nothing here is odds, spreads,
implied probabilities, picks or "value" — this is "what happened", not betting.

Run:
    python nfl_ingest.py --backfill     # one-time: last 6 seasons
    python nfl_ingest.py                # weekly: the current/most-recent season only
"""
import argparse
import json
import os
from datetime import date, datetime, timezone

import nflreadpy as nfl

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "nfl")
SKILL_POS = {"QB", "RB", "WR", "TE", "FB"}
N_BACKFILL = 6           # seasons of history
RECENT_GAMES = 6         # game-log length kept for "Who's Hot" sparklines


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def to_pd(df):
    """nflreadpy returns Polars; the rest of our tooling is pandas-friendly."""
    return df.to_pandas() if hasattr(df, "to_pandas") else df


def col(df, *names):
    """First column name present in df (nflverse renames things over time)."""
    for n in names:
        if n in df.columns:
            return n
    return None


def num(v, default=0.0):
    try:
        if v is None:
            return default
        f = float(v)
        return default if f != f else f  # NaN guard
    except (TypeError, ValueError):
        return default


def r1(v):
    return round(num(v), 1)


def r3(v):
    return round(num(v), 3)


def write(name, obj):
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, name), "w", encoding="utf-8") as fh:
        json.dump(obj, fh, separators=(",", ":"), ensure_ascii=False)
    print(f"  wrote nfl/{name} ({os.path.getsize(os.path.join(OUT_DIR, name)):,} bytes)")


def latest_completed_season():
    """NFL seasons are labelled by their September start year; before September the
    most recent *completed* season is the previous calendar year."""
    t = date.today()
    return t.year if t.month >= 9 else t.year - 1


# --------------------------------------------------------------------------- #
# Schedules -> games + team records
# --------------------------------------------------------------------------- #
def build_schedule(seasons):
    df = to_pd(nfl.load_schedules(seasons=seasons))
    c_date = col(df, "gameday", "game_date")
    c_type = col(df, "game_type", "season_type")
    games = []
    for _, r in df.iterrows():
        hs, as_ = r.get("home_score"), r.get("away_score")
        if hs is None or as_ is None or (isinstance(hs, float) and hs != hs) or (isinstance(as_, float) and as_ != as_):
            continue  # not played yet
        hs, as_ = int(hs), int(as_)
        home, away = r.get("home_team"), r.get("away_team")
        winner = home if hs > as_ else away if as_ > hs else "TIE"
        games.append({
            "season": int(r.get("season")),
            "week": int(r.get("week")),
            "type": (r.get(c_type) if c_type else "REG"),
            "date": str(r.get(c_date)) if c_date else None,
            "home": home, "away": away,
            "home_score": hs, "away_score": as_, "winner": winner,
        })
    games.sort(key=lambda g: (g["season"], g["week"]))
    return games


def team_records(games):
    """Per season -> per team: W/L, points for/against, and last-5 form (chrono)."""
    out = {}
    for g in games:
        s = str(g["season"])
        out.setdefault(s, {})
        for team, pf, pa in ((g["home"], g["home_score"], g["away_score"]),
                             (g["away"], g["away_score"], g["home_score"])):
            t = out[s].setdefault(team, {"team": team, "games": 0, "wins": 0, "losses": 0,
                                          "ties": 0, "pts_for": 0, "pts_against": 0, "_form": []})
            t["games"] += 1
            t["pts_for"] += pf
            t["pts_against"] += pa
            res = "W" if pf > pa else "L" if pa > pf else "T"
            if res == "W":
                t["wins"] += 1
            elif res == "L":
                t["losses"] += 1
            else:
                t["ties"] += 1
            t["_form"].append(res)
    return out


# --------------------------------------------------------------------------- #
# Play-by-play -> team offensive/defensive aggregates (yards, takeaways, EPA)
# --------------------------------------------------------------------------- #
def pbp_team_aggregates(seasons):
    """Per season -> per team: offensive yards, yards allowed, takeaways, giveaways,
    and EPA/play for and against. Loaded one season at a time to bound memory."""
    agg = {}
    for yr in seasons:
        try:
            df = to_pd(nfl.load_pbp(seasons=[yr]))
        except Exception as exc:  # noqa: BLE001
            print(f"  ! pbp {yr} failed ({exc}); skipping advanced team metrics for {yr}")
            continue
        s = str(yr)
        agg.setdefault(s, {})
        c_yds = col(df, "yards_gained")
        c_epa = col(df, "epa")
        c_int = col(df, "interception")
        c_fl = col(df, "fumble_lost")
        for _, r in df.iterrows():
            off, dfd = r.get("posteam"), r.get("defteam")
            if not off or not dfd:
                continue
            o = agg[s].setdefault(off, _blank_pbp(off))
            d = agg[s].setdefault(dfd, _blank_pbp(dfd))
            yds = num(r.get(c_yds)) if c_yds else 0.0
            o["yards_for"] += yds
            d["yards_against"] += yds
            if c_epa and r.get(c_epa) is not None and num(r.get(c_epa)) == num(r.get(c_epa)):
                o["epa_for_sum"] += num(r.get(c_epa)); o["epa_for_n"] += 1
                d["epa_against_sum"] += num(r.get(c_epa)); d["epa_against_n"] += 1
            # turnovers: charge takeaway to the defense, giveaway to the offense
            to = (num(r.get(c_int)) if c_int else 0) + (num(r.get(c_fl)) if c_fl else 0)
            if to:
                d["takeaways"] += 1
                o["giveaways"] += 1
        print(f"  pbp {yr}: aggregated {len(agg[s])} teams")
    return agg


def _blank_pbp(team):
    return {"team": team, "yards_for": 0.0, "yards_against": 0.0, "takeaways": 0,
            "giveaways": 0, "epa_for_sum": 0.0, "epa_for_n": 0,
            "epa_against_sum": 0.0, "epa_against_n": 0}


# --------------------------------------------------------------------------- #
# Weekly player stats -> Who's Hot logs + player-vs-opponent splits
# --------------------------------------------------------------------------- #
def build_players(seasons, current_season):
    df = to_pd(nfl.load_player_stats(seasons=seasons))
    c_id = col(df, "player_id", "gsis_id")
    c_name = col(df, "player_display_name", "player_name")
    c_pos = col(df, "position", "position_group")
    c_team = col(df, "team", "recent_team")
    c_opp = col(df, "opponent_team", "opponent")
    c_fp = col(df, "fantasy_points_ppr", "fantasy_points")
    c_pass = col(df, "passing_yards")
    c_rush = col(df, "rushing_yards")
    c_rec = col(df, "receiving_yards")

    logs = {}   # player_id -> list of per-game dicts (all loaded seasons)
    meta = {}   # player_id -> {name,pos}
    for _, r in df.iterrows():
        pos = r.get(c_pos) if c_pos else None
        # Only filter to skill positions if a position column actually exists —
        # otherwise keep everyone rather than silently dropping all players.
        if c_pos and pos not in SKILL_POS:
            continue
        pid = r.get(c_id)
        if not pid:
            continue
        g = {
            "season": int(num(r.get("season"))),
            "week": int(num(r.get("week"))),
            "team": r.get(c_team) if c_team else None,
            "opp": r.get(c_opp) if c_opp else None,
            "fp": r1(r.get(c_fp)) if c_fp else 0.0,
            "pass": int(num(r.get(c_pass))) if c_pass else 0,
            "rush": int(num(r.get(c_rush))) if c_rush else 0,
            "rec": int(num(r.get(c_rec))) if c_rec else 0,
        }
        logs.setdefault(pid, []).append(g)
        meta[pid] = {"name": r.get(c_name) if c_name else pid, "pos": pos}

    players_recent = []
    vs_opp = {}
    for pid, gl in logs.items():
        gl.sort(key=lambda x: (x["season"], x["week"]))
        cur = [g for g in gl if g["season"] == current_season]
        m = meta[pid]
        # Who's Hot: most-recent season season-average + last-N game log
        if cur:
            fps = [g["fp"] for g in cur]
            season_avg = r1(sum(fps) / len(fps)) if fps else 0.0
            players_recent.append({
                "id": pid, "name": m["name"], "pos": m["pos"],
                "team": cur[-1]["team"], "season_avg_fp": season_avg,
                "games": cur[-RECENT_GAMES:],
            })
        # Player vs opponent splits (all loaded seasons) + sample size
        by_opp = {}
        for g in gl:
            if not g["opp"]:
                continue
            o = by_opp.setdefault(g["opp"], {"games": 0, "fp": 0.0, "yds": 0.0})
            o["games"] += 1
            o["fp"] += g["fp"]
            o["yds"] += g["pass"] + g["rush"] + g["rec"]
        all_fp = [g["fp"] for g in gl]
        vs_opp[pid] = {
            "name": m["name"], "pos": m["pos"],
            "team": gl[-1]["team"],
            "career_avg_fp": r1(sum(all_fp) / len(all_fp)) if all_fp else 0.0,
            "vs": {opp: {"games": v["games"], "avg_fp": r1(v["fp"] / v["games"]),
                         "avg_yds": r1(v["yds"] / v["games"])}
                   for opp, v in by_opp.items()},
        }
    players_recent.sort(key=lambda p: p["season_avg_fp"], reverse=True)
    return players_recent, vs_opp


# --------------------------------------------------------------------------- #
# Assemble teams.json from records + pbp aggregates
# --------------------------------------------------------------------------- #
def assemble_teams(records, pbp):
    out = {}
    for s, teams in records.items():
        out[s] = {}
        for team, t in teams.items():
            g = max(t["games"], 1)
            p = pbp.get(s, {}).get(team, {})
            o = {
                "team": team, "games": t["games"],
                "wins": t["wins"], "losses": t["losses"], "ties": t["ties"],
                "pts_for_pg": r1(t["pts_for"] / g), "pts_against_pg": r1(t["pts_against"] / g),
                "last5": t["_form"][-5:],
            }
            if p:
                o["yards_for_pg"] = r1(p["yards_for"] / g)
                o["yards_against_pg"] = r1(p["yards_against"] / g)
                o["takeaways"] = p["takeaways"]
                o["giveaways"] = p["giveaways"]
                o["epa_for_play"] = r3(p["epa_for_sum"] / p["epa_for_n"]) if p["epa_for_n"] else None
                o["epa_against_play"] = r3(p["epa_against_sum"] / p["epa_against_n"]) if p["epa_against_n"] else None
            out[s][team] = o
    return out


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="last 6 seasons (else current only)")
    args = ap.parse_args()

    latest = latest_completed_season()
    seasons = list(range(latest - N_BACKFILL + 1, latest + 1)) if args.backfill else [latest]
    print(f"NFL ingest — seasons {seasons} ({'backfill' if args.backfill else 'incremental'})")

    print("schedules…")
    games = build_schedule(seasons)
    records = team_records(games)

    print("play-by-play (team aggregates)…")
    pbp = pbp_team_aggregates(seasons)

    print("weekly player stats…")
    players_recent, vs_opp = build_players(seasons, latest)

    teams = assemble_teams(records, pbp)

    # team list for the matchup selector (from the latest season)
    team_list = sorted(teams.get(str(latest), {}).keys())
    weeks = sorted({g["week"] for g in games if g["season"] == latest})

    write("schedule.json", games)
    write("teams.json", teams)
    write("players_recent.json", players_recent)
    write("player_vs_opp.json", vs_opp)
    write("meta.json", {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "nflverse (CC-BY 4.0)",
        "seasons": seasons,
        "current_season": latest,
        "weeks": weeks,
        "teams": team_list,
        "note": "Descriptive historical analytics only — not betting advice.",
    })
    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
