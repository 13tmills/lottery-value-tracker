#!/usr/bin/env python3
"""Build tools-index.json — per-game jackpot-cycle counts for the jackpot-growth-stats tool.

A jackpot "cycle" is a reset-to-win run in the advertised-jackpot saw-tooth; a drop of more
than 30% from the previous draw marks a win/reset. Running this after the scrapers lets the
jackpot-stats game list auto-include any game that has accumulated enough cycles (the page
shows games with >= 15), with no hand-maintained list.
"""
import glob
import json
import os
from datetime import date

HIST = os.path.join(os.path.dirname(__file__), "..", "history")


def count_cycles(series):
    cycles, prev = 0, None
    for jp in series:
        if prev is not None and jp < prev * 0.7:
            cycles += 1
        prev = jp
    return cycles


def main():
    out = {}
    for path in sorted(glob.glob(os.path.join(HIST, "*.json"))):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError):
            continue
        game_key = os.path.splitext(os.path.basename(path))[0]
        if game_key.startswith("uk_"):
            continue  # UK games are in £; the jackpot-stats tool renders $ — keep them out
        series = [d["jackpot"] for d in data.get("draws", [])
                  if isinstance(d.get("jackpot"), (int, float))]
        if len(series) < 2:
            continue
        cycles = count_cycles(series)
        if cycles > 0:
            out[game_key] = cycles

    index = {"generated": date.today().isoformat(), "jackpot_cycles": out}
    dest = os.path.join(HIST, "..", "tools-index.json")
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(index, fh, indent=2)
        fh.write("\n")
    eligible = sorted(k for k, c in out.items() if c >= 15)
    print(f"tools-index.json: {len(out)} games with jackpot cycles; "
          f"{len(eligible)} eligible (>=15): {', '.join(eligible)}")
    return 0


if __name__ == "__main__":
    main()
